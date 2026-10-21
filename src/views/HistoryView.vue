<script setup lang="ts">
// Listening history: every track played in this browser, newest first, grouped
// by day.
import { computed, ref } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import CoverArt from "@/components/base/CoverArt.vue";
import { formatCount, formatDuration } from "@/lib/format";
import { DAY_MS, groupByDay, historyEntryToSong, timeLabel } from "@/lib/history";
import { useHistoryStore, type HistoryEntry } from "@/stores/history";
import { usePlayerStore } from "@/stores/player";
import "./history.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const RANGES = [
  { id: "7", label: "history.range7", ms: 7 * DAY_MS },
  { id: "30", label: "history.range30", ms: 30 * DAY_MS },
  { id: "all", label: "history.rangeAll", ms: Number.MAX_SAFE_INTEGER },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const history = useHistoryStore();
const player = usePlayerStore();

const range = ref<RangeId>("7");
const confirmClear = ref(false);

const windowMs = computed(() => RANGES.find((r) => r.id === range.value)?.ms ?? 7 * DAY_MS);
const visible = computed(() => {
  const cutoff = Date.now() - windowMs.value;
  return history.entries.filter((e) => e.playedAt >= cutoff);
});
const days = computed(() => groupByDay(visible.value));
const top = computed(() => history.top(windowMs.value, 5));

// Play from this entry onwards in the order it was heard: pressing play on
// something from last night replays that evening, not just one track.
function playFrom(entry: HistoryEntry): void {
  // The log is newest first: everything from the top down to this entry,
  // turned back into the order it was heard, starts at this entry.
  const at = visible.value.indexOf(entry);
  if (at === -1) return;
  const inOrderHeard = visible.value
    .slice(0, at + 1)
    .reverse()
    .map(historyEntryToSong);
  player.playNow(inOrderHeard, inOrderHeard.length - 1);
}

function clearAll(): void {
  history.clear();
  confirmClear.value = false;
}
</script>

<template>
  <div class="page history-page">
    <header class="page-head history-head">
      <div>
        <h1>{{ t("history.title") }}</h1>
        <p class="muted history-sub">
          {{ t("history.intro") }}
        </p>
      </div>
      <div class="history-actions">
        <div class="history-ranges" role="group" :aria-label="t('history.timeRange')">
          <button
            v-for="r in RANGES"
            :key="r.id"
            class="btn btn-ghost"
            :class="{ 'history-range-active': range === r.id }"
            :aria-pressed="range === r.id"
            @click="range = r.id"
          >
            {{ t(r.label) }}
          </button>
        </div>
        <template v-if="history.entries.length > 0">
          <template v-if="confirmClear">
            <button class="btn btn-danger" @click="clearAll">{{ t("history.deleteAll") }}</button>
            <button class="btn btn-ghost" @click="confirmClear = false">
              {{ t("common.cancel") }}
            </button>
          </template>
          <button v-else class="btn btn-ghost" @click="confirmClear = true">
            {{ t("queue.clear") }}
          </button>
        </template>
      </div>
    </header>

    <div v-if="visible.length === 0" class="center-state">
      <AppIcon name="clock" :size="30" />
      <p>
        {{ history.entries.length === 0 ? t("history.emptyAll") : t("history.emptyRange") }}
      </p>
    </div>
    <template v-else>
      <section v-if="top.length > 1" class="history-top">
        <h2 class="history-section-title">{{ t("albums.sort.frequent") }}</h2>
        <div class="history-top-list">
          <button
            v-for="{ entry, plays } in top"
            :key="entry.id"
            class="history-top-item"
            @click="player.playNow([historyEntryToSong(entry)], 0)"
          >
            <CoverArt :cover-art="entry.coverArt" :size="44" alt="" class="history-cover" />
            <span class="history-top-meta">
              <span class="history-top-title">{{ entry.title }}</span>
              <span class="muted">{{ entry.artist }}</span>
            </span>
            <span class="history-plays muted">{{ t("history.plays", { n: plays }) }}</span>
          </button>
        </div>
      </section>

      <section v-for="day in days" :key="day.label" class="history-day">
        <h2 class="history-section-title">
          {{ day.label }}
          <span class="muted history-day-count">
            · {{ formatCount(day.entries.length, "track") }}</span
          >
        </h2>
        <div class="history-list">
          <div
            v-for="entry in day.entries"
            :key="`${entry.id}-${entry.playedAt}`"
            class="history-row"
            @dblclick="playFrom(entry)"
          >
            <span class="history-time muted">{{ timeLabel(entry.playedAt) }}</span>
            <button
              class="history-play"
              :aria-label="t('common.playItem', { name: entry.title })"
              @click="playFrom(entry)"
            >
              <AppIcon name="play" :size="14" />
            </button>
            <CoverArt :cover-art="entry.coverArt" :size="36" alt="" class="history-cover" />
            <span class="history-meta">
              <span class="history-title">{{ entry.title }}</span>
              <RouterLink
                v-if="entry.artistId"
                :to="`/artist/${entry.artistId}`"
                class="muted history-link"
              >
                {{ entry.artist }}
              </RouterLink>
              <span v-else class="muted">{{ entry.artist }}</span>
            </span>
            <RouterLink
              v-if="entry.albumId"
              :to="`/album/${entry.albumId}`"
              class="muted history-album"
            >
              {{ entry.album }}
            </RouterLink>
            <span class="muted history-dur">{{ formatDuration(entry.duration ?? 0) }}</span>
            <button
              class="icon-btn history-queue"
              :aria-label="t('common.addToQueue')"
              :title="t('common.addToQueue')"
              @click="player.addToQueue([historyEntryToSong(entry)])"
            >
              <AppIcon name="queue" :size="15" />
            </button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
