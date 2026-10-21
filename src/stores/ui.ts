// Shell-level UI state shared between components that don't share a parent:
// the mobile drawer, the full-screen player, app-wide dialogs, the toast, the
// "focus search" request, and the sidebar playlist under a dragged track.

import { defineStore } from "pinia";
import { ref } from "vue";
import type { Song } from "@/api/types";

export type DownloadTarget =
  | { kind: "song"; song: Song }
  | { kind: "album"; id: string; name: string; artist?: string; songs: Song[] }
  | { kind: "playlist"; id: string; name: string; songs: Song[] };

export const useUiStore = defineStore("ui", () => {
  // Mobile navigation drawer (the off-canvas sidebar).
  const drawerOpen = ref(false);

  // Full-screen "now playing" view, and the route to return to when it closes.
  const fullScreen = ref(false);
  const fullScreenReturnPath = ref("/");

  // App-wide dialogs.
  const commandPaletteOpen = ref(false);
  const shortcutsHelpOpen = ref(false);
  const uploadOpen = ref(false);
  const addToPlaylistIds = ref<string[] | null>(null);
  const downloadTarget = ref<DownloadTarget | null>(null);

  // A transient status message (link copied, added to playlist…).
  const toast = ref<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  // Bumped to ask the top bar to focus its search field.
  const searchFocusTick = ref(0);

  // Which sidebar playlist is under a dragged track, for the drop highlight.
  const playlistDropTarget = ref<string | null>(null);

  function showToast(message: string, ms = 2600): void {
    toast.value = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.value = null), ms);
  }

  function openAddToPlaylist(songIds: string[]): void {
    if (songIds.length > 0) addToPlaylistIds.value = songIds;
  }

  function openDownload(target: DownloadTarget): void {
    if (target.kind !== "song" && target.songs.length === 0) return;
    downloadTarget.value = target;
  }

  function requestSearchFocus(): void {
    searchFocusTick.value++;
  }

  return {
    drawerOpen,
    fullScreen,
    fullScreenReturnPath,
    commandPaletteOpen,
    shortcutsHelpOpen,
    uploadOpen,
    addToPlaylistIds,
    downloadTarget,
    toast,
    searchFocusTick,
    playlistDropTarget,
    showToast,
    openAddToPlaylist,
    openDownload,
    requestSearchFocus,
  };
});
