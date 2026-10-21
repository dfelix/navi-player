// Lock-screen and notification controls, and the keyboard's media keys,
// through the Media Session API: the platform shows what's playing (with
// cover and progress) and its buttons drive the player.

import { watchEffect } from "vue";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";

const ART_SIZES = [96, 256, 512];
const DEFAULT_SKIP_S = 10;

export function useMediaSession(): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const media = navigator.mediaSession;
  const player = usePlayerStore();
  const session = useSessionStore();

  watchEffect(() => {
    const song = player.current;
    const client = session.client;
    media.metadata = song
      ? new MediaMetadata({
          title: song.title,
          artist: song.artist ?? "",
          album: song.album ?? "",
          artwork:
            client && song.coverArt
              ? ART_SIZES.map((px) => ({
                  src: client.coverArtUrl(song.coverArt, px),
                  sizes: `${px}x${px}`,
                }))
              : [],
        })
      : null;
  });

  watchEffect(() => {
    media.playbackState = player.state.isPlaying ? "playing" : "paused";
  });

  // The progress bar on the lock screen.
  watchEffect(() => {
    const { duration, currentTime: position, isPlaying } = player.state;
    if (typeof media.setPositionState !== "function") return;
    try {
      if (duration > 0 && position <= duration) {
        media.setPositionState({ duration, position, playbackRate: isPlaying ? 1 : 0 });
      } else {
        media.setPositionState();
      }
    } catch {
      // Browsers reject a position briefly past the end; the next update fixes it.
    }
  });

  const actions: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
    play: () => player.togglePlay(),
    pause: () => player.togglePlay(),
    previoustrack: () => player.previous(),
    nexttrack: () => player.next(),
    seekbackward: ({ seekOffset }) => player.seekBy(-(seekOffset ?? DEFAULT_SKIP_S)),
    seekforward: ({ seekOffset }) => player.seekBy(seekOffset ?? DEFAULT_SKIP_S),
    seekto: ({ seekTime }) => seekTime !== undefined && player.seek(seekTime),
    stop: () => player.stop(),
  };
  for (const [action, handler] of Object.entries(actions)) {
    try {
      media.setActionHandler(action as MediaSessionAction, handler);
    } catch {
      // This platform doesn't offer that button.
    }
  }
}
