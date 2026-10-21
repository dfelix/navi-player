// Signing in to Navidrome with a username and password.
//
// The preferred way is Navidrome's own /auth/login: one request returns a JWT
// (for statistics, playlist covers and shares) and the Subsonic salt and token
// (for everything else). Some reverse proxies only pass /rest through, so the
// fallback is plain Subsonic token auth: the token is derived here and checked
// with a ping. Either way the password is sent once and never kept.

import { t } from "@/i18n";
import type { ServerCredentials } from "./credentials";
import { randomSalt, subsonicToken } from "./subsonicAuth";
import { Transport } from "./transport";
import { ApiError, NetworkError } from "./types";

// What Navidrome's /auth/login answers.
interface NativeLogin {
  username: string;
  isAdmin?: boolean;
  token?: string; // the JWT
  subsonicSalt?: string;
  subsonicToken?: string;
}

const cantReach = () => new ApiError(t("errors.unreachable"));

export async function loginNative(
  serverUrl: string,
  username: string,
  password: string,
): Promise<ServerCredentials> {
  let res: Response;
  try {
    res = await fetch(`${serverUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw cantReach();
  }
  // 401 is Navidrome's answer to a wrong password: final, not a reason to try
  // the fallback.
  if (res.status === 401) throw new ApiError(t("errors.badCredentials"), 401, true);
  if (!res.ok) throw new ApiError(t("errors.loginHttp", { status: res.status }), res.status);

  const login = (await res.json()) as NativeLogin;
  if (!login.subsonicSalt || !login.subsonicToken) {
    throw new ApiError(t("errors.missingCredentials"));
  }
  return {
    serverUrl,
    username: login.username,
    authMethod: "native",
    subsonicSalt: login.subsonicSalt,
    subsonicToken: login.subsonicToken,
    jwt: login.token,
    isAdmin: login.isAdmin,
    savedAt: Date.now(),
  };
}

export async function loginSubsonic(
  serverUrl: string,
  username: string,
  password: string,
): Promise<ServerCredentials> {
  const salt = randomSalt();
  const creds: ServerCredentials = {
    serverUrl,
    username,
    authMethod: "subsonic",
    subsonicSalt: salt,
    subsonicToken: subsonicToken(password, salt),
    savedAt: Date.now(),
  };
  try {
    // Nobody to tell about a refused sign-in yet: the caller shows the error.
    await new Transport(creds, () => {}).subsonic("ping.view");
  } catch (err) {
    if (err instanceof NetworkError) throw cantReach();
    if (!(err instanceof ApiError)) throw err;
    if (err.isAuthError) throw new ApiError(t("errors.badCredentials"), err.code, true);
    throw new ApiError(t("errors.loginHttp", { status: err.code ?? "?" }), err.code);
  }
  return creds;
}
