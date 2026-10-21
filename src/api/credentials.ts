// The saved session, in localStorage.
//
// A deployment talks to one Navidrome, so there is one saved session at most.
// It holds what Navidrome issued at sign-in (the Subsonic salt and token, and
// for a password sign-in a JWT), never the password. It also records which
// server it came from: if the deployment is pointed at another server, the
// record is thrown away rather than its token sent somewhere new.

const KEY = "navi-player:auth";

export interface ServerCredentials {
  // The API base the session was issued by, without a trailing slash.
  serverUrl: string;
  username: string;
  // "native": signed in through Navidrome's /auth/login (JWT + Subsonic token).
  // "subsonic": Subsonic token only, when /auth/login couldn't be reached.
  authMethod: "native" | "subsonic";
  subsonicSalt: string;
  subsonicToken: string;
  jwt?: string;
  isAdmin?: boolean;
  savedAt: number;
}

// localStorage can be missing or refuse writes (private browsing, blocked
// storage); then the session simply lasts until the page is closed.
function read(): ServerCredentials | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ServerCredentials) : null;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: ServerCredentials): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(creds));
  } catch {
    // See read().
  }
}

export function clearCredentials(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // See read().
  }
}

// The saved session for `serverUrl`, or null. A session saved for another
// server, or one missing its token, is deleted.
export function loadCredentials(serverUrl: string): ServerCredentials | null {
  const saved = read();
  if (!saved) return null;
  const usable = saved.serverUrl === serverUrl && !!saved.subsonicToken && !!saved.subsonicSalt;
  if (!usable) {
    clearCredentials();
    return null;
  }
  return saved;
}

// Who was signed in last, to fill in the sign-in form again.
export function storedUsername(): string | null {
  return read()?.username ?? null;
}

// Keep the newest JWT Navidrome handed back, leaving the rest as it was.
export function updateJwt(serverUrl: string, jwt: string): void {
  const saved = loadCredentials(serverUrl);
  if (saved) saveCredentials({ ...saved, jwt });
}
