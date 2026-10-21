<script setup lang="ts">
// A list of tracks, with optional column headings. Every row plays within
// the whole list, and rows can be multi-selected and dragged.
import type { Song } from "@/api/types";
import { useSelectionStore } from "@/stores/selection";
import { useSettingsStore } from "@/stores/settings";
import TrackRow from "./TrackRow.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    songs: Song[];
    showCover?: boolean;
    showAlbum?: boolean;
    showHeader?: boolean;
    numbering?: "track" | "index" | "none"; // track numbers, positions, or none
    removable?: boolean; // rows offer "Remove from playlist" and emit `remove`
    highlightId?: string; // the track a shared link points at
    // Names the list, which turns on multi-select. A selection belongs to one
    // list, so this must be stable and unique: an album id, a playlist id…
    selectionId?: string;
    // An album shown as one list per disc: the whole album and where this disc
    // starts in it, so a Shift-click range can cross discs.
    selectionContext?: Song[];
    selectionOffset?: number;
  }>(),
  { numbering: "track", selectionOffset: 0 },
);

const emit = defineEmits<{ remove: [index: number] }>();

const settings = useSettingsStore();
const selection = useSelectionStore();

const wholeList = () => props.selectionContext ?? props.songs;

function numberFor(song: Song, i: number): number | undefined {
  switch (props.numbering) {
    case "none":
      return undefined;
    case "index":
      return i + 1;
    default:
      return song.track ?? i + 1;
  }
}

// Dragging a selected row drags the whole selection, as in a file manager.
function dragPayload(song: Song): string[] {
  const inSelection =
    !!props.selectionId &&
    selection.listId === props.selectionId &&
    selection.isSelected(props.selectionId, song.id);
  return inSelection ? selection.selectedSongs(wholeList()).map((s) => s.id) : [song.id];
}

function onRowClick(i: number, event: MouseEvent): void {
  if (props.selectionId) {
    selection.handleRowClick(props.selectionId, props.selectionOffset + i, wholeList(), event);
  }
}
</script>

<template>
  <div class="tracklist">
    <!-- Spacer columns mirror the row layout so labels line up with values. -->
    <div v-if="showHeader" class="tracklist-head">
      <span class="tracklist-head-num">#</span>
      <span v-if="showCover" class="tracklist-head-cover" />
      <span class="tracklist-head-title">{{ t("track.title") }}</span>
      <span v-if="showAlbum" class="tracklist-head-album">{{ t("track.album") }}</span>
      <span v-if="settings.layout.showPlayCounts" class="tracklist-head-plays" />
      <span class="tracklist-head-star" />
      <span class="tracklist-head-dur">{{ t("track.time") }}</span>
      <span class="tracklist-head-spacer" />
    </div>
    <TrackRow
      v-for="(song, i) in songs"
      :key="`${song.id}-${i}`"
      :song="song"
      :number="numberFor(song, i)"
      :context="songs"
      :context-index="i"
      :show-cover="showCover"
      :show-album="showAlbum"
      :highlighted="highlightId === song.id"
      :selected="!!selectionId && selection.isSelected(selectionId, song.id)"
      :drag-song-ids="() => dragPayload(song)"
      :removable="removable"
      @row-click="onRowClick(i, $event)"
      @remove="emit('remove', i)"
    />
  </div>
</template>
