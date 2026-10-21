// Selecting several tracks in a list, the way file managers do it: Ctrl/⌘-
// click adds or removes one, Shift-click selects a range.
//
// A selection belongs to one list (an album, a playlist, a search…), named
// by an id. Going to another list starts afresh, so nothing stays selected
// out of sight.

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Song } from "@/api/types";

type Modifiers = Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">;

export const useSelectionStore = defineStore("selection", () => {
  const list = ref<string | null>(null);
  const ids = ref<string[]>([]); // in the order they were selected
  const anchor = ref(0); // where a Shift-click range starts

  const count = computed(() => ids.value.length);
  const listId = computed(() => list.value);

  function set(listName: string | null, chosen: string[], from = 0): void {
    list.value = chosen.length > 0 ? listName : null;
    ids.value = list.value ? chosen : [];
    anchor.value = from;
  }

  function clear(): void {
    set(null, []);
  }

  function isSelected(listName: string, id: string): boolean {
    return list.value === listName && ids.value.includes(id);
  }

  // The selected songs, in the list's order.
  function selectedSongs(songs: Song[]): Song[] {
    const chosen = new Set(ids.value);
    return songs.filter((song) => chosen.has(song.id));
  }

  // A row was clicked. True when the click selected something, so the row
  // shouldn't also play.
  function handleRowClick(
    listName: string,
    index: number,
    songs: Song[],
    keys: Modifiers,
  ): boolean {
    const toggle = keys.ctrlKey || keys.metaKey;
    if (!toggle && !keys.shiftKey) return false;
    const song = songs[index];
    if (!song) return false;

    if (list.value !== listName) {
      set(listName, [song.id], index); // the first selection in this list
    } else if (keys.shiftKey) {
      const [from, to] = [anchor.value, index].sort((a, b) => a - b);
      set(
        listName,
        songs.slice(from, to + 1).map((s) => s.id),
        anchor.value,
      );
    } else {
      const without = ids.value.filter((id) => id !== song.id);
      set(listName, without.length < ids.value.length ? without : [...ids.value, song.id], index);
    }
    return true;
  }

  // Ctrl/⌘+A in a list.
  function selectAll(listName: string, songs: Song[]): void {
    set(
      listName,
      songs.map((song) => song.id),
    );
  }

  return { count, listId, isSelected, clear, selectedSongs, handleRowClick, selectAll };
});
