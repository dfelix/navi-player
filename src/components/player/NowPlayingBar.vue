<script setup lang="ts">
// The persistent now-playing bar: transport controls, seek bar, volume, and the
// current track with its favourite toggle.
import { computed, ref } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import BaseSlider from "@/components/base/BaseSlider.vue";
import CoverArt from "@/components/base/CoverArt.vue";
import MenuButton from "@/components/base/MenuButton.vue";
import type { IconName } from "@/components/base/icons";
import type { ActionItem } from "@/components/base/menu";
import { formatDuration } from "@/lib/format";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { useStarsStore } from "@/stores/stars";
import { useUiStore } from "@/stores/ui";
import "./nowplaying.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const player = usePlayerStore();
const settings = useSettingsStore();
const stars = useStarsStore();
const ui = useUiStore();

const song = computed(() => player.current);
const starred = computed(() => !!song.value && stars.isStarred(song.value.id, song.value.starred));

const volIcon = computed<IconName>(() => {
  const { muted, volume } = player.state;
  if (muted || !volume) return "volume-mute";
  return volume >= 0.5 ? "volume" : "volume-low";
});

const pop = ref(false);
function starCurrent(): void {
  const s = song.value;
  if (!s) return;
  const becoming = !starred.value;
  void stars.toggle(s.id, s.starred, "song");
  if (becoming) {
    pop.value = true;
    setTimeout(() => (pop.value = false), 360);
  }
}

// Sleep timer choices: minutes, or "after this track". While one is set, a
// way to cancel it is added.
const SLEEP_AFTER: (number | "end")[] = [15, 30, 45, 60, "end"];

function sleepLabel(choice: number | "end"): string {
  if (choice === "end") return t("player.sleepEndOfTrack");
  return choice === 60 ? t("player.sleepHour") : t("player.sleepMinutes", { n: choice });
}

const sleepItems = computed<ActionItem[]>(() => {
  const running = player.sleepMode;
  const choices: ActionItem[] = SLEEP_AFTER.map((choice) => ({
    label: sleepLabel(choice) + (running === choice ? "  ✓" : ""),
    onSelect: () => player.setSleepTimer(choice),
  }));
  if (running === null) return choices;
  return [
    ...choices,
    {
      label: t("player.sleepOff"),
      icon: "close",
      danger: true,
      separatorBefore: true,
      onSelect: () => player.setSleepTimer(null),
    },
  ];
});

const volumePercent = computed({
  get: () => (player.state.muted ? 0 : player.state.volume * 100),
  set: (v: number) => player.setVolume(v / 100),
});

const position = computed({
  get: () => player.state.currentTime,
  set: (v: number) => player.seek(v),
});
</script>

<template>
  <footer class="np-bar" :class="{ 'np-empty': !song }">
    <div class="np-left">
      <template v-if="song">
        <button
          class="np-cover-btn"
          :aria-label="t('player.openFullScreen')"
          :title="t('player.openFullScreen')"
          @click="ui.fullScreen = true"
        >
          <CoverArt :cover-art="song.coverArt" :size="56" alt="" />
          <span class="np-cover-expand">
            <AppIcon name="chevron-right" :size="18" />
          </span>
        </button>
        <!-- Re-keyed on the track id so title/artist crossfade in step with the
             album art when the song changes. -->
        <div :key="song.id" class="np-meta">
          <RouterLink :to="song.albumId ? `/album/${song.albumId}` : '/'" class="np-title">
            {{ song.title }}
          </RouterLink>
          <RouterLink
            :to="song.artistId ? `/artist/${song.artistId}` : '/'"
            class="np-artist muted"
          >
            {{ song.artist }}
          </RouterLink>
        </div>
        <button
          class="icon-btn np-star"
          :class="{ active: starred, 'heart-pop': pop }"
          :aria-label="starred ? t('common.removeFavourite') : t('common.favourite')"
          :aria-pressed="starred"
          @click="starCurrent"
        >
          <AppIcon :name="starred ? 'heart-filled' : 'heart'" :size="18" />
        </button>
      </template>
      <div v-else class="np-placeholder muted">{{ t("player.nothingPlaying") }}</div>
    </div>

    <div class="np-center">
      <div class="np-controls">
        <button
          class="icon-btn"
          :class="{ active: player.state.shuffle }"
          :aria-label="t('player.shuffle')"
          :aria-pressed="player.state.shuffle"
          @click="player.toggleShuffle()"
        >
          <AppIcon name="shuffle" :size="17" />
        </button>
        <button class="icon-btn" :aria-label="t('player.previous')" @click="player.previous()">
          <AppIcon name="prev" :size="20" />
        </button>
        <button
          class="np-play"
          :aria-label="player.state.isPlaying ? t('player.pause') : t('player.play')"
          @click="player.togglePlay()"
        >
          <AppIcon :name="player.state.isPlaying ? 'pause' : 'play'" :size="22" />
        </button>
        <button class="icon-btn" :aria-label="t('player.next')" @click="player.next()">
          <AppIcon name="next" :size="20" />
        </button>
        <button
          class="icon-btn"
          :class="{ active: player.state.repeat !== 'off' }"
          :aria-label="t('player.repeat', { mode: t(`player.repeatMode.${player.state.repeat}`) })"
          @click="player.cycleRepeat()"
        >
          <AppIcon :name="player.state.repeat === 'one' ? 'repeat-one' : 'repeat'" :size="17" />
        </button>
      </div>

      <div class="np-seek">
        <span class="np-time muted">{{ formatDuration(player.state.currentTime) }}</span>
        <BaseSlider
          v-model="position"
          :max="player.state.duration || 1"
          :label="t('player.seek')"
          :disabled="!song"
        />
        <span class="np-time muted">{{ formatDuration(player.state.duration) }}</span>
      </div>
    </div>

    <div class="np-right">
      <button
        class="icon-btn"
        :class="{ active: settings.layout.showLyricsPanel }"
        :aria-label="t('player.toggleLyrics')"
        :aria-pressed="settings.layout.showLyricsPanel"
        @click="settings.update((s) => (s.layout.showLyricsPanel = !s.layout.showLyricsPanel))"
      >
        <AppIcon name="lyrics" :size="18" />
      </button>
      <button
        class="icon-btn"
        :class="{ active: settings.layout.showQueuePanel }"
        :aria-label="t('player.toggleQueue')"
        :aria-pressed="settings.layout.showQueuePanel"
        @click="settings.update((s) => (s.layout.showQueuePanel = !s.layout.showQueuePanel))"
      >
        <AppIcon name="queue" :size="18" />
      </button>
      <MenuButton
        :items="sleepItems"
        icon="clock"
        :icon-size="18"
        :label="t('player.sleepTimer')"
        :class="{ active: player.sleepMode !== null }"
      />
      <div class="np-volume">
        <button
          class="icon-btn"
          :aria-label="t('player.mute')"
          :aria-pressed="player.state.muted"
          @click="player.toggleMute()"
        >
          <AppIcon :name="volIcon" :size="18" />
        </button>
        <BaseSlider
          v-model="volumePercent"
          :max="100"
          :label="t('player.volume')"
          class="np-volume-slider"
        />
      </div>
    </div>
  </footer>
</template>
