// Subsonic token authentication: the server is sent md5(password + salt) and
// the salt, never the password. A fresh salt per sign-in means the token can't
// be replayed against a different salt.

import { md5 } from "js-md5";

// js-md5 hashes strings as UTF-8, which is what Subsonic servers do, so
// passwords with accents or emoji produce the token the server expects.
export function subsonicToken(password: string, salt: string): string {
  return md5(password + salt);
}

// Hex from the platform's cryptographic random source. Subsonic only requires
// "at least six characters"; 16 leaves no room for guessing.
export function randomSalt(bytes = 8): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
