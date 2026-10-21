// How requests reach Navidrome. Two surfaces:
//
// - The Subsonic API (/rest/*): authenticated by a salted token in the query
//   string, answering with a JSON envelope `{ "subsonic-response": … }` whose
//   `status` says whether it worked.
// - Navidrome's own API (/api/*): authenticated by the session JWT in the
//   `x-nd-authorization` header, which Navidrome re-issues on every response.
//   Only a password sign-in has a JWT.
//
// Everything that can go wrong becomes an ApiError with a translated message,
// and anything that means "your session is no longer valid" also tells the
// session store, so it can ask for the password again.

import { t } from "@/i18n";
import { SUBSONIC_CLIENT } from "@/lib/branding";
import { updateJwt, type ServerCredentials } from "./credentials";
import { ApiError, NetworkError } from "./types";

export const SUBSONIC_API_VERSION = "1.16.1";

// Subsonic error codes that mean the credentials were refused: wrong
// credentials (40), token auth not supported (41/42), or token expired (44).
const AUTH_FAILURE_CODES = new Set([40, 41, 42, 44]);

export type ParamValue = string | number | boolean | undefined | null;
// An array becomes a repeated parameter (songId=a&songId=b), as Subsonic expects.
export type Params = Record<string, ParamValue | readonly ParamValue[]>;

interface SubsonicEnvelope {
  status?: string;
  error?: { code?: number; message?: string };
  [key: string]: unknown;
}

export class Transport {
  constructor(
    readonly creds: ServerCredentials,
    private readonly onAuthFailure: () => void,
  ) {}

  // ---- Subsonic ----

  // The query string for a Subsonic request: credentials, protocol fields and
  // the call's own parameters. `json: false` for binary endpoints (stream,
  // download), which ignore the format field and have been seen to misbehave
  // with it.
  query(params: Params = {}, { json = true } = {}): URLSearchParams {
    const q = new URLSearchParams();
    q.set("u", this.creds.username);
    q.set("t", this.creds.subsonicToken);
    q.set("s", this.creds.subsonicSalt);
    q.set("v", SUBSONIC_API_VERSION);
    q.set("c", SUBSONIC_CLIENT);
    if (json) q.set("f", "json");
    for (const [name, value] of Object.entries(params)) {
      const values = Array.isArray(value) ? value : [value];
      for (const v of values) if (v !== undefined && v !== null) q.append(name, String(v));
    }
    return q;
  }

  subsonicUrl(endpoint: string, params: Params = {}, opts?: { json?: boolean }): string {
    return `${this.creds.serverUrl}/rest/${endpoint}?${this.query(params, opts)}`;
  }

  // A Subsonic call, returning the envelope's contents.
  async subsonic<T>(endpoint: string, params: Params = {}): Promise<T> {
    const res = await this.send(this.subsonicUrl(endpoint, params));
    if (!res.ok) throw new ApiError(t("errors.http", { status: res.status }), res.status);

    let body: { "subsonic-response"?: SubsonicEnvelope };
    try {
      body = await res.json();
    } catch {
      throw new ApiError(t("errors.malformed"));
    }
    const envelope = body["subsonic-response"];
    if (!envelope) throw new ApiError(t("errors.malformed"));
    if (envelope.status !== "ok") {
      const code = envelope.error?.code;
      const authFailed = code !== undefined && AUTH_FAILURE_CODES.has(code);
      if (authFailed) this.onAuthFailure();
      throw new ApiError(envelope.error?.message || t("errors.malformed"), code, authFailed);
    }
    return envelope as T;
  }

  // ---- Navidrome's own API ----

  get hasJwt(): boolean {
    return !!this.creds.jwt;
  }

  // A request to /api/…, with the session JWT. Returns the response for the
  // caller to read; 401/403 are turned into errors here unless `allow403`
  // (some calls want to say "no permission" rather than "signed out").
  async native(path: string, init: RequestInit = {}, { allow403 = false } = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("x-nd-authorization", `Bearer ${this.creds.jwt ?? ""}`);
    const res = await this.send(
      `${this.creds.serverUrl}/api/${path}`,
      { ...init, headers },
      {
        checkAuth: false,
      },
    );
    this.rollJwt(res);
    if (res.status === 401 || (res.status === 403 && !allow403)) this.authFailed(res.status);
    return res;
  }

  // One page of a native list resource (/api/song, /api/album…).
  async nativeList<T>(resource: string, query: Record<string, string | number>): Promise<T[]> {
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
    const res = await this.native(`${resource}?${qs}`);
    if (!res.ok) throw new ApiError(t("errors.http", { status: res.status }), res.status);
    const rows: unknown = await res.json();
    return Array.isArray(rows) ? (rows as T[]) : [];
  }

  // ---- Shared ----

  private async send(
    url: string,
    init?: RequestInit,
    { checkAuth = true } = {},
  ): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      throw new NetworkError(t("errors.network"));
    }
    if (checkAuth && (res.status === 401 || res.status === 403)) this.authFailed(res.status);
    return res;
  }

  private authFailed(status: number): never {
    this.onAuthFailure();
    throw new ApiError(t("errors.authExpired"), status, true);
  }

  // Navidrome sends a fresh JWT with each native response; keep the newest so
  // the session doesn't expire while it's being used.
  private rollJwt(res: Response): void {
    const header = res.headers.get("x-nd-authorization");
    if (!header) return;
    const token = header.replace(/^Bearer\s+/i, "");
    if (!token || token === this.creds.jwt) return;
    this.creds.jwt = token;
    updateJwt(this.creds.serverUrl, token);
  }
}
