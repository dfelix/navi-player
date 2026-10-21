// Calls this server makes to Navidrome on its own account: checking that a
// caller is an admin, starting a library scan, and the read-only lookups for
// link previews.

import { createHash, randomBytes } from "node:crypto";
import type { Context } from "hono";
import { config } from "./config.js";

const API_VERSION = "1.16.1";
const CLIENT = "navi-player";

// Subsonic credentials and protocol fields as a query string.
export function subsonicQuery(
  user: string,
  token: string,
  salt: string,
  extra: Record<string, string> = {},
  { json = true } = {},
): URLSearchParams {
  const q = new URLSearchParams({ u: user, t: token, s: salt, v: API_VERSION, c: CLIENT });
  if (json) q.set("f", "json");
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q;
}

export const restUrl = (endpoint: string, query: URLSearchParams) =>
  `${config.navidrome}/rest/${endpoint}?${query}`;

// The contents of a Subsonic envelope, or null for any failure.
export async function subsonicGet<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const envelope = ((await res.json()) as { "subsonic-response"?: { status?: string } })[
      "subsonic-response"
    ];
    return envelope?.status === "ok" ? (envelope as T) : null;
  } catch {
    return null;
  }
}

// ---- The caller's own credentials ----

// Sent by the app (NavidromeClient.getServerAuthHeaders) so this server can
// check, and act, as that user.
export interface CallerAuth {
  jwt?: string;
  user?: string;
  token?: string;
  salt?: string;
}

export function callerAuth(c: Context): CallerAuth {
  return {
    jwt: c.req.header("x-nd-authorization"),
    user: c.req.header("x-nd-subsonic-u"),
    token: c.req.header("x-nd-subsonic-t"),
    salt: c.req.header("x-nd-subsonic-s"),
  };
}

const hasSubsonic = (a: CallerAuth): a is Required<Pick<CallerAuth, "user" | "token" | "salt">> =>
  !!(a.user && a.token && a.salt);

// Whether Navidrome says this caller is an admin. Everything that writes to
// the music folder is behind this, and only Navidrome's answer counts.
export async function isAdmin(auth: CallerAuth): Promise<boolean> {
  if (!config.navidrome) return false;
  // Navidrome's user list is admin-only: being allowed to read it is the answer.
  if (auth.jwt) {
    const res = await fetch(`${config.navidrome}/api/user?_start=0&_end=1`, {
      headers: { "x-nd-authorization": auth.jwt },
    }).catch(() => null);
    if (res?.ok) return true;
  }
  if (!hasSubsonic(auth)) return false;
  const query = subsonicQuery(auth.user, auth.token, auth.salt, { username: auth.user });
  const me = await subsonicGet<{ user?: { adminRole?: boolean } }>(restUrl("getUser.view", query));
  return me?.user?.adminRole === true;
}

// Ask Navidrome to look for new files. Best-effort: a scan can always be
// started by hand.
export async function startScan(auth: CallerAuth): Promise<boolean> {
  try {
    if (hasSubsonic(auth)) {
      const res = await fetch(
        restUrl("startScan.view", subsonicQuery(auth.user, auth.token, auth.salt)),
      );
      return res.ok;
    }
    if (auth.jwt) {
      const res = await fetch(`${config.navidrome}/api/scanner`, {
        method: "PUT",
        headers: { "x-nd-authorization": auth.jwt, "Content-Type": "application/json" },
        body: JSON.stringify({ fullRescan: false }),
      });
      return res.ok;
    }
  } catch {
    // Not reachable; the files are written regardless.
  }
  return false;
}

// ---- The link-preview account ----

// A fresh salt and token for every request, from the configured password.
export function previewQuery(extra: Record<string, string> = {}): URLSearchParams {
  const salt = randomBytes(9).toString("hex");
  const token = createHash("md5")
    .update(config.preview.password + salt)
    .digest("hex");
  return subsonicQuery(config.preview.user, token, salt, extra);
}
