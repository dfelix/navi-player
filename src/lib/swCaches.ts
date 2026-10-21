// Caches the service worker (public/sw.js) keeps that the app must manage.
// public/sw.js is plain JavaScript outside the build, so the name is repeated
// there; tests/unit/lib/swCaches.spec.ts checks the two match.

// Cover art. Its keys are getCoverArt URLs, which carry the account's Subsonic
// token, so it is dropped whenever the account changes or signs out.
export const ART_CACHE = "navi-player-art-v1";

export async function clearCoverArtCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    await caches.delete(ART_CACHE);
  } catch {
    // Storage unavailable: nothing was cached either.
  }
}
