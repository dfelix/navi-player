<script setup lang="ts">
// The queue panel: tracks already played (folded away), the one playing, and
// what's next, which can be dragged into order or removed. With Infinite radio
// on, a few tracks it would add next are previewed underneath.
import { useQuery } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import CoverArt from "@/components/base/CoverArt.vue";
import { formatDuration } from "@/lib/format";
import { applyDiscoveryFilters } from "@/lib/recommendations";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import "./queuepanel.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const player = usePlayerStore();
const session = useSessionStore();
const settings = useSettingsStore();

const PREVIEWED = 6;

const dragIndex = ref<number | null>(null);
const overIndex = ref<number | null>(null);
// Folded by default: the panel is about what's coming, but "what was that,
// two songs ago?" deserves an answer too.
const showHistory = ref(false);
const currentRow = ref<HTMLElement | null>(null);

// Queue positions from the current track on; the rows keep these real indexes.
const start = computed(() => Math.max(0, player.state.index));
const played = computed(() => player.state.queue.slice(0, start.value));
const upcoming = computed(() => player.state.queue.slice(start.value));

function setCurrentRow(el: unknown, index: number): void {
  if (index === player.state.index) currentRow.value = el as HTMLElement | null;
}

function jumpToCurrent(): void {
  currentRow.value?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function onDragStart(event: DragEvent, index: number): void {
  dragIndex.value = index;
  event.dataTransfer?.setData("text/plain", "");
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onDragEnd(): void {
  dragIndex.value = overIndex.value = null;
}

function onDrop(target: number): void {
  const from = dragIndex.value;
  onDragEnd();
  if (from !== null && from !== target) player.moveInQueue(from, target);
}

// What Infinite radio would follow the queue with: songs like the last one.
// (A station tops itself up, so it has no preview.)
const lastSong = computed(() => player.state.queue.at(-1));
const { data: suggestions } = useQuery(() => ({
  queryKey: ["autoplay-suggest", lastSong.value?.id ?? ""],
  queryFn: () => session.requireClient().getSimilarSongs(lastSong.value!.id, 10),
  enabled: !!session.client && !!lastSong.value && settings.playback.autoplay && !player.station,
  staleTime: 5 * 60_000,
}));
const suggested = computed(() => {
  const queued = new Set(player.state.queue.map(({ id }) => id));
  const notQueued = (suggestions.value ?? []).filter(({ id }) => !queued.has(id));
  return applyDiscoveryFilters(notQueued).slice(0, PREVIEWED);
});
</script>

<template>
  <aside class="side-panel queue-panel">
    <div class="side-panel-head">
      <h2 class="side-panel-title">{{ t("queue.title") }}</h2>
      <div v-if="player.state.queue.length > 0" class="queue-head-actions">
        <button
          v-if="player.state.index >= 0"
          class="btn btn-ghost queue-clear"
          :title="t('queue.jumpHint')"
          @click="jumpToCurrent"
        >
          {{ t("queue.jumpToCurrent") }}
        </button>
        <button class="btn btn-ghost queue-clear" @click="player.clearQueue()">
          {{ t("queue.clear") }}
        </button>
      </div>
    </div>

    <div v-if="player.station" class="queue-station">
      <AppIcon name="radio" :size="16" class="queue-station-icon" />
      <div class="queue-station-text">
        <span class="queue-station-kicker muted">{{ t("queue.playingFrom") }}</span>
        <RouterLink :to="`/artist/${player.station.id}`" class="queue-station-name">
          {{ t("queue.station", { name: player.station.name }) }}
        </RouterLink>
      </div>
      <button
        class="btn btn-ghost queue-clear"
        :title="t('queue.stopStationHint', { name: player.station.name })"
        @click="player.stopStation()"
      >
        {{ t("queue.stopStation") }}
      </button>
    </div>

    <div v-if="upcoming.length === 0" class="center-state">
      <AppIcon name="queue" :size="30" />
      <p>{{ t("queue.empty") }}</p>
    </div>

    <div v-else class="queue-list">
      <template v-if="played.length > 0">
        <button
          class="queue-history-toggle"
          :aria-expanded="showHistory"
          @click="showHistory = !showHistory"
        >
          <AppIcon :name="showHistory ? 'chevron-down' : 'chevron-right'" :size="14" />
          <span>{{
            showHistory
              ? t("queue.hidePlayed", played.length)
              : t("queue.showPlayed", played.length)
          }}</span>
        </button>
        <template v-if="showHistory">
          <div
            v-for="(song, i) in played"
            :key="`played-${song.id}-${i}`"
            class="queue-item queue-item-played"
            @dblclick="player.playNow(player.state.queue, i)"
          >
            <span class="queue-grip queue-played-index" aria-hidden="true">{{ i + 1 }}</span>
            <CoverArt :cover-art="song.coverArt" :size="38" alt="" class="queue-cover" />
            <div class="queue-meta">
              <span class="queue-title">{{ song.title }}</span>
              <span class="queue-artist muted">{{ song.artist }}</span>
            </div>
            <span class="queue-dur muted">{{ formatDuration(song.duration) }}</span>
          </div>
        </template>
      </template>

      <div
        v-for="(song, i) in upcoming"
        :key="`up-${song.id}-${start + i}`"
        :ref="(el) => setCurrentRow(el, start + i)"
        class="queue-item"
        :class="{
          'queue-item-current': start + i === player.state.index,
          'queue-item-over': overIndex === start + i,
        }"
        draggable="true"
        @dragstart="onDragStart($event, start + i)"
        @dragover.prevent="overIndex = start + i"
        @dragend="onDragEnd"
        @drop.prevent="onDrop(start + i)"
        @dblclick="player.playNow(player.state.queue, start + i)"
      >
        <span class="queue-grip" aria-hidden="true">
          <AppIcon name="grip" :size="16" />
        </span>
        <CoverArt :cover-art="song.coverArt" :size="38" alt="" class="queue-cover" />
        <div class="queue-meta">
          <span class="queue-title" :class="{ 'accent-text': start + i === player.state.index }">
            {{ song.title }}
          </span>
          <span class="queue-artist muted">
            {{ song.artist }}
            <!-- Say which tracks you didn't pick: Infinite radio appends to the
                 queue silently, and unlabelled it looks random. -->
            <span v-if="song.autoQueued" class="queue-auto-tag" :title="t('queue.radioHint')">{{
              t("queue.radioTag")
            }}</span>
          </span>
        </div>
        <span class="queue-dur muted">{{ formatDuration(song.duration) }}</span>
        <button
          class="icon-btn queue-remove"
          :aria-label="t('queue.remove')"
          @click="player.removeAt(start + i)"
        >
          <AppIcon name="close" :size="15" />
        </button>
      </div>

      <template v-if="settings.playback.autoplay && !player.station && suggested.length > 0">
        <div class="queue-suggest-head">
          <AppIcon name="trending" :size="13" />
          <span>{{ t("queue.autoplayNext") }}</span>
        </div>
        <button
          v-for="song in suggested"
          :key="`sugg-${song.id}`"
          class="queue-item queue-suggest"
          :title="t('common.addToQueue')"
          @click="player.addToQueue([song])"
        >
          <span class="queue-grip queue-suggest-add" aria-hidden="true">
            <AppIcon name="plus" :size="15" />
          </span>
          <CoverArt :cover-art="song.coverArt" :size="38" alt="" class="queue-cover" />
          <div class="queue-meta">
            <span class="queue-title">{{ song.title }}</span>
            <span class="queue-artist muted">{{ song.artist }}</span>
          </div>
          <span class="queue-dur muted">{{ formatDuration(song.duration) }}</span>
        </button>
      </template>
    </div>
  </aside>
</template>
