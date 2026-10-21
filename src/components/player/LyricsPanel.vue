<script setup lang="ts">
// Lyrics side panel. Shows the current track's lyrics; when synced, highlights
// and auto-scrolls the active line against playback position, and clicking a
// line seeks to it.
//
// The server is always asked first. Most self-hosted libraries have no lyrics
// tags at all, so when it comes back empty and the user opted in, LRCLIB is
// asked as a fallback — see services/lrclib for what that sends.
import { useTemplateRef, watch } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import { useLyrics } from "@/composables/useLyrics";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import "./lyricspanel.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const player = usePlayerStore();
const settings = useSettingsStore();
const list = useTemplateRef<HTMLDivElement>("list");

const { song, isLoading, best, activeLine, source } = useLyrics(
  () => settings.layout.showLyricsPanel && !settings.layout.showQueuePanel,
);

watch(activeLine, (idx) => {
  if (idx < 0 || !list.value) return;
  list.value
    .querySelector<HTMLElement>(`[data-line="${idx}"]`)
    ?.scrollIntoView({ block: "center", behavior: "smooth" });
});

function seekTo(start: number | undefined): void {
  if (best.value?.synced && start !== undefined) player.seek(start / 1000);
}
</script>

<template>
  <aside class="side-panel lyrics-panel">
    <div class="side-panel-head">
      <h2 class="side-panel-title">{{ t("lyrics.title") }}</h2>
    </div>

    <div v-if="!song" class="center-state">
      <AppIcon name="lyrics" :size="30" />
      <p>{{ t("lyrics.playSomething") }}</p>
    </div>
    <div v-else-if="isLoading" class="center-state" role="status" :aria-label="t('lyrics.loading')">
      <span class="spinner" />
    </div>
    <div v-else-if="!best || best.line.length === 0" class="center-state">
      <AppIcon name="lyrics" :size="30" />
      <p>{{ t("lyrics.none") }}</p>
      <i18n-t
        v-if="!settings.playback.onlineLyrics"
        keypath="lyrics.onlineHint"
        tag="p"
        class="muted lyrics-hint"
      >
        <template #setting>
          <b>{{ t("settings.playback.onlineLyrics") }}</b>
        </template>
      </i18n-t>
    </div>
    <div v-else ref="list" class="lyrics-body" :class="{ 'lyrics-synced': best.synced }">
      <!-- These didn't come from your library, so say so — and make the
           mismatch checkable when the timings are off. -->
      <p v-if="source === 'lrclib'" class="lyrics-credit muted">
        {{ t("lyrics.fromLrclib") }} <em>{{ best.displayArtist }} — {{ best.displayTitle }}</em>
      </p>
      <p
        v-for="(line, i) in best.line"
        :key="i"
        class="lyrics-line"
        :data-line="i"
        :class="{
          'lyrics-line-active': best.synced && i === activeLine,
          'lyrics-line-past': best.synced && i < activeLine,
        }"
        @click="seekTo(line.start)"
      >
        {{ line.value || " " }}
      </p>
    </div>
  </aside>
</template>
