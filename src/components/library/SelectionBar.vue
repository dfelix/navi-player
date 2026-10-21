<script setup lang="ts">
// The bar shown while tracks are selected: play, queue or add them to a
// playlist all at once, in the order the list shows them.
import { computed } from "vue";
import type { Song } from "@/api/types";
import AppIcon from "@/components/base/AppIcon.vue";
import { usePlayerStore } from "@/stores/player";
import { useSelectionStore } from "@/stores/selection";
import { useUiStore } from "@/stores/ui";
import "./selectionbar.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{ listId: string; songs: Song[] }>();

const player = usePlayerStore();
const selection = useSelectionStore();
const ui = useUiStore();

// A page can show several lists; only the one holding the selection shows its bar.
const active = computed(() => selection.count > 0 && selection.listId === props.listId);

// Do something with the selected songs, then let them go.
function run(withSongs: (songs: Song[]) => void): void {
  const chosen = selection.selectedSongs(props.songs);
  if (!chosen.length) return;
  withSongs(chosen);
  selection.clear();
}
</script>

<template>
  <div v-if="active" class="selection-bar" role="toolbar" :aria-label="t('selection.label')">
    <span class="selection-count">{{ t("selection.count", selection.count) }}</span>
    <div class="selection-actions">
      <button class="btn btn-primary" @click="run((s) => player.playNow(s, 0))">
        <AppIcon name="play" :size="15" /> {{ t("common.play") }}
      </button>
      <button class="btn" @click="run((s) => player.playNext(s))">
        <AppIcon name="next" :size="15" /> {{ t("common.playNext") }}
      </button>
      <button class="btn" @click="run((s) => player.addToQueue(s))">
        <AppIcon name="queue" :size="15" /> {{ t("common.addToQueue") }}
      </button>
      <button class="btn" @click="run((s) => ui.openAddToPlaylist(s.map((song) => song.id)))">
        <AppIcon name="plus" :size="15" /> {{ t("common.addToPlaylist") }}
      </button>
    </div>
    <button
      class="icon-btn selection-clear"
      :aria-label="t('selection.clear')"
      :title="t('selection.clearHint')"
      @click="selection.clear()"
    >
      <AppIcon name="close" :size="16" />
    </button>
  </div>
</template>
