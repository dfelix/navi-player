// The keyboard shortcuts (rebindable in Settings → Advanced), plus three
// fixed keys: Ctrl/⌘+K opens the command palette from anywhere, "?" shows the
// shortcut list, and Escape clears a track selection. Keys typed into fields
// are left alone, except Ctrl/⌘+K, which is the way out of anything.

import { onBeforeUnmount, onMounted } from "vue";
import type { ShortcutAction } from "@/lib/settingsSchema";
import { isTypingTarget, keyFromEvent, shortcutActionForEvent } from "@/lib/shortcutMatching";
import { usePlayerStore } from "@/stores/player";
import { useSelectionStore } from "@/stores/selection";
import { useSettingsStore } from "@/stores/settings";
import { useStarsStore } from "@/stores/stars";
import { useUiStore } from "@/stores/ui";

const SEEK_S = 5;
const VOLUME_STEP = 0.05;

export function useShortcuts(): void {
  const player = usePlayerStore();
  const settings = useSettingsStore();
  const stars = useStarsStore();
  const selection = useSelectionStore();
  const ui = useUiStore();

  const run: Record<ShortcutAction, () => void> = {
    playPause: () => player.togglePlay(),
    next: () => player.next(),
    previous: () => player.previous(),
    seekForward: () => player.seekBy(SEEK_S),
    seekBackward: () => player.seekBy(-SEEK_S),
    volumeUp: () => player.changeVolume(VOLUME_STEP),
    volumeDown: () => player.changeVolume(-VOLUME_STEP),
    toggleMute: () => player.toggleMute(),
    toggleQueue: () =>
      settings.update((s) => void (s.layout.showQueuePanel = !s.layout.showQueuePanel)),
    toggleLyrics: () =>
      settings.update((s) => void (s.layout.showLyricsPanel = !s.layout.showLyricsPanel)),
    focusSearch: () => ui.requestSearchFocus(),
    toggleShuffle: () => player.toggleShuffle(),
    toggleRepeat: () => player.cycleRepeat(),
    starCurrent: () => {
      const song = player.current;
      if (song) void stars.toggle(song.id, song.starred, "song");
    },
  };

  function fixedKey(event: KeyboardEvent): (() => void) | null {
    const mod = (event.ctrlKey || event.metaKey) && !event.altKey;
    if (mod && event.key.toLowerCase() === "k") return () => (ui.commandPaletteOpen = true);
    if (isTypingTarget(event.target)) return null;
    if (["?", "Shift+?"].includes(keyFromEvent(event))) {
      return () => (ui.shortcutsHelpOpen = !ui.shortcutsHelpOpen);
    }
    if (event.key === "Escape" && selection.count > 0) return () => selection.clear();
    return null;
  }

  function onKey(event: KeyboardEvent): void {
    const fixed = fixedKey(event);
    const action = fixed ? null : shortcutActionForEvent(event, settings.power.shortcuts);
    if (!fixed && !action) return;
    event.preventDefault();
    if (fixed) fixed();
    else run[action!]();
  }

  onMounted(() => window.addEventListener("keydown", onKey));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
}
