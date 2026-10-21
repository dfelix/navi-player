<script setup lang="ts">
// "Download…": pick a quality for a song, album or playlist (opened from their
// menus through useUiStore().openDownload). The work is in services/download.
import { computed, ref } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import BaseDialog from "@/components/base/BaseDialog.vue";
import { formatCount } from "@/lib/format";
import {
  QUALITIES,
  downloadCollectionClientZip,
  downloadCollectionOriginal,
  downloadCollectionZip,
  downloadSong,
  isLossy,
  type Quality,
} from "@/services/download";
import { useServerConfigStore } from "@/stores/serverConfig";
import { useUiStore } from "@/stores/ui";
import { useI18n } from "vue-i18n";
import "./download.css";

const ui = useUiStore();
const { t: i18nT } = useI18n(); // `t` names the download target below
const serverConfig = useServerConfigStore();

const busy = ref(false);
// While the browser builds a ZIP, which can take a while: "track 3 of 12".
const progress = ref<{ done: number; total: number } | null>(null);
const clientZipping = ref(false);

const open = computed({
  get: () => ui.downloadTarget !== null,
  set: (isOpen) => void (isOpen || (ui.downloadTarget = null)),
});

const title = computed(() => {
  const target = ui.downloadTarget;
  return !target ? "" : target.kind === "song" ? target.song.title : target.name;
});

const subtitle = computed(() => {
  const target = ui.downloadTarget;
  if (!target) return "";
  if (target.kind !== "song") return formatCount(target.songs.length, "track");
  return target.song.artist ?? i18nT("download.song");
});

// A song is one file. For an album or playlist: original files come zipped by
// Navidrome; converted ones are zipped by NaviPlayer's server when it's there,
// or in the browser (with progress) on static hosting.
async function choose(quality: Quality): Promise<void> {
  const target = ui.downloadTarget;
  if (!target || busy.value) return;
  busy.value = true;
  try {
    if (target.kind === "song") {
      await downloadSong(target.song, quality);
    } else if (!isLossy(quality)) {
      downloadCollectionOriginal(target.id);
    } else {
      const collection = {
        songs: target.songs,
        quality,
        zipBaseName:
          target.kind === "album" && target.artist
            ? `${target.artist} - ${target.name}`
            : target.name,
        byTrackNumber: target.kind === "album",
      };
      if (serverConfig.proxyMode) {
        downloadCollectionZip(collection);
      } else {
        clientZipping.value = true;
        progress.value = { done: 0, total: target.songs.length };
        await downloadCollectionClientZip({
          ...collection,
          onProgress: (done, total) => (progress.value = { done, total }),
        });
      }
    }
    ui.downloadTarget = null;
  } catch (err) {
    alert(err instanceof Error ? err.message : i18nT("download.failed"));
  } finally {
    busy.value = false;
    clientZipping.value = false;
    progress.value = null;
  }
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="i18nT('download.title')" content-class="dl-dialog">
    <div v-if="ui.downloadTarget" class="dl-target">
      <AppIcon :name="ui.downloadTarget.kind === 'playlist' ? 'list' : 'disc'" :size="16" />
      <div class="dl-target-text">
        <span class="dl-target-title">{{ title }}</span>
        <span class="muted">{{ subtitle }}</span>
      </div>
    </div>

    <div class="dl-qualities">
      <button
        v-for="q in QUALITIES"
        :key="q.id"
        class="dl-quality"
        :disabled="busy"
        @click="choose(q)"
      >
        <AppIcon name="download" :size="16" />
        <span class="dl-quality-text">
          <span class="dl-quality-label">{{ i18nT(`download.quality.${q.id}.label`) }}</span>
          <span class="muted">{{ i18nT(`download.quality.${q.id}.sub`) }}</span>
        </span>
      </button>
    </div>

    <p v-if="progress" class="dl-note muted">
      {{ i18nT("download.progress", { done: progress.done, total: progress.total }) }}
    </p>
    <p v-if="clientZipping" class="dl-note muted">
      {{ i18nT("download.inBrowser") }}
    </p>
  </BaseDialog>
</template>
