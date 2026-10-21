<script setup lang="ts">
// Full-screen "now playing" view. Opened by clicking the artwork in the
// now-playing bar. Album art is the hero; transport, seek and volume live below
// it, over an ambient backdrop built from the cover. Closes on the collapse
// chevron or Escape, with a brief slide-out so it doesn't just vanish.
//
// It lives at /listen/:artist/:id, so the player is a shareable address.
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppIcon from "@/components/base/AppIcon.vue";
import BaseSlider from "@/components/base/BaseSlider.vue";
import CoverArt from "@/components/base/CoverArt.vue";
import ToggleMenuButton from "@/components/base/ToggleMenuButton.vue";
import type { IconName } from "@/components/base/icons";
import type { ToggleItem } from "@/components/base/menu";
import { useLyrics } from "@/composables/useLyrics";
import { fadeBackdrop, glowLayers, pickDistinct, readCoverColours } from "@/lib/artColours";
import { slugify } from "@/lib/slug";
import { formatDuration } from "@/lib/format";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useStarsStore } from "@/stores/stars";
import { useUiStore } from "@/stores/ui";
import "./fullscreen.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const route = useRoute();
const router = useRouter();
const player = usePlayerStore();
const session = useSessionStore();
const settings = useSettingsStore();
const stars = useStarsStore();
const ui = useUiStore();
const closeBtn = useTemplateRef<HTMLButtonElement>("closeBtn");

const song = computed(() => player.current);
const leaving = ref(false);
const starred = computed(() => !!song.value && stars.isStarred(song.value.id, song.value.starred));

// URL sync: first entry remembers where to return on close; song changes
// replace the entry rather than piling up history.
watchEffect(() => {
  const s = song.value;
  if (!s || leaving.value) return;
  const target = `/listen/${slugify(s.artist)}/${s.id}`;
  if (route.path === target) return;
  const inListen = route.path.startsWith("/listen/");
  if (!inListen) ui.fullScreenReturnPath = route.fullPath;
  void router[inListen ? "replace" : "push"](target);
});

// Going back (or forward) to a page that isn't /listen closes the player.
watch(
  () => route.path.startsWith("/listen/"),
  (inListen, wasInListen) => {
    if (wasInListen && !inListen) ui.fullScreen = false;
  },
);

// The blurred cover behind everything.
const backdrop = computed(() => {
  const art = song.value?.coverArt;
  const url = art && session.client?.coverArtUrl(art, 600);
  return url ? `url("${url}")` : "none";
});

// The cover's colours for the glows and the fade, when the cover can be read
// (same origin, or a server that allows it).
const coverColors = ref<string[]>([]);
const gradient = ref("");
watchEffect(() => {
  const c = session.client;
  const art = song.value?.coverArt;
  if (!c || !art) {
    coverColors.value = [];
    gradient.value = "";
    return;
  }
  readCoverColours(c.coverArtUrl(art, 256))
    .then(({ swatches, accent }) => {
      const cols = pickDistinct([accent, ...swatches], 4);
      coverColors.value = cols;
      gradient.value = fadeBackdrop(cols);
    })
    .catch(() => {
      coverColors.value = [];
      gradient.value = "";
    });
});
const mesh = computed(() => glowLayers(coverColors.value));

const volIcon = computed<IconName>(() => {
  const { muted, volume } = player.state;
  if (muted || !volume) return "volume-mute";
  return volume >= 0.5 ? "volume" : "volume-low";
});

const subtitle = computed(() => {
  const s = song.value;
  return s ? [s.album, s.year ? String(s.year) : undefined].filter(Boolean).join(" · ") : "";
});

const displayItems = computed<ToggleItem[]>(() => [
  {
    label: t("player.ambientBackdrop"),
    icon: "image",
    checked: settings.layout.fullScreenBackdrop,
    onChange: (on) => settings.update((s) => void (s.layout.fullScreenBackdrop = on)),
  },
]);

// Lyrics, loaded quietly in the background. Only a *synced* set with real
// timestamps is ever surfaced here; anything else shows nothing, so the layout
// never shifts for it.
const { best, activeLine } = useLyrics(true);
const syncedLyric = computed(() => {
  const l = best.value;
  return l?.synced && l.line.some((ln) => ln.start !== undefined) ? l : undefined;
});
const currentLine = computed(() => syncedLyric.value?.line[activeLine.value]?.value.trim() ?? "");
const nextLine = computed(() => syncedLyric.value?.line[activeLine.value + 1]?.value.trim() ?? "");

const position = computed({
  get: () => player.state.currentTime,
  set: (v: number) => player.seek(v),
});
const volumePercent = computed({
  get: () => (player.state.muted ? 0 : player.state.volume * 100),
  set: (v: number) => player.setVolume(v / 100),
});

// Animate out, then close and go back to the page the player was opened from
// (replacing /listen, so Back doesn't open it again).
function close(): void {
  if (leaving.value) return;
  leaving.value = true;
  setTimeout(() => {
    ui.fullScreen = false;
    if (route.path.startsWith("/listen/")) void router.replace(ui.fullScreenReturnPath);
  }, 240);
}

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  close();
}

onMounted(() => {
  closeBtn.value?.focus();
  document.addEventListener("keydown", closeOnEscape);
});
onBeforeUnmount(() => document.removeEventListener("keydown", closeOnEscape));
</script>

<template>
  <div
    class="fs-player"
    :class="{ 'fs-leaving': leaving, 'fs-has-mesh': !!mesh }"
    role="dialog"
    aria-modal="true"
    :aria-label="t('player.nowPlaying')"
  >
    <div
      v-if="settings.layout.fullScreenBackdrop"
      class="fs-backdrop"
      :style="{ backgroundImage: backdrop }"
      aria-hidden="true"
    />
    <!-- Re-keyed on the palette so each track's colours fade in fresh. -->
    <div
      v-if="mesh"
      :key="mesh"
      class="fs-mesh"
      :style="{ backgroundImage: mesh }"
      aria-hidden="true"
    />
    <div class="fs-scrim" aria-hidden="true" />
    <div
      v-if="settings.layout.fullScreenBackdrop && gradient"
      class="fs-gradient"
      :style="{ backgroundImage: gradient }"
      aria-hidden="true"
    />

    <div class="fs-inner">
      <header class="fs-top">
        <button
          ref="closeBtn"
          class="icon-btn fs-collapse"
          :aria-label="t('player.closeFullScreen')"
          :title="t('player.closeEsc')"
          @click="close"
        >
          <AppIcon name="chevron-right" :size="22" />
        </button>
        <span class="fs-top-label muted">{{
          player.station
            ? `${t("queue.playingFrom")} ${t("queue.station", { name: player.station.name })}`
            : t("player.nowPlaying")
        }}</span>
        <ToggleMenuButton
          class="fs-display-menu"
          icon="sliders"
          :icon-size="20"
          :label="t('player.displayOptions')"
          :heading="t('player.display')"
          :items="displayItems"
        />
      </header>

      <div v-if="!song" class="fs-empty muted">{{ t("player.nothingPlaying") }}</div>
      <template v-else>
        <div class="fs-art">
          <CoverArt :cover-art="song.coverArt" :alt="song.album ?? ''" class="fs-cover" />
        </div>

        <div class="fs-info">
          <div class="fs-text">
            <RouterLink
              :to="song.albumId ? `/album/${song.albumId}` : '/'"
              class="fs-title"
              @click="close"
            >
              {{ song.title }}
            </RouterLink>
            <RouterLink
              :to="song.artistId ? `/artist/${song.artistId}` : '/'"
              class="fs-artist"
              @click="close"
            >
              {{ song.artist }}
            </RouterLink>
            <span v-if="subtitle" class="fs-subtitle muted">{{ subtitle }}</span>
          </div>
          <button
            class="icon-btn fs-star"
            :class="{ active: starred }"
            :aria-label="starred ? t('common.removeFavourite') : t('common.favourite')"
            :aria-pressed="starred"
            @click="stars.toggle(song.id, song.starred, 'song')"
          >
            <AppIcon :name="starred ? 'heart-filled' : 'heart'" :size="24" />
          </button>
        </div>

        <div v-if="syncedLyric" class="fs-lyric" aria-hidden="true">
          <p v-if="currentLine" :key="currentLine" class="fs-lyric-current">{{ currentLine }}</p>
          <p v-if="nextLine" class="fs-lyric-next">{{ nextLine }}</p>
        </div>

        <div class="fs-seek">
          <span class="fs-time muted">{{ formatDuration(player.state.currentTime) }}</span>
          <BaseSlider
            v-model="position"
            :max="player.state.duration || 1"
            :label="t('player.seek')"
          />
          <span class="fs-time muted">{{ formatDuration(player.state.duration) }}</span>
        </div>

        <div class="fs-controls">
          <button
            class="icon-btn fs-ctrl"
            :class="{ active: player.state.shuffle }"
            :aria-label="t('player.shuffle')"
            :aria-pressed="player.state.shuffle"
            @click="player.toggleShuffle()"
          >
            <AppIcon name="shuffle" :size="20" />
          </button>
          <button
            class="icon-btn fs-ctrl"
            :aria-label="t('player.previous')"
            @click="player.previous()"
          >
            <AppIcon name="prev" :size="26" />
          </button>
          <button
            class="fs-play"
            :aria-label="player.state.isPlaying ? t('player.pause') : t('player.play')"
            @click="player.togglePlay()"
          >
            <AppIcon :name="player.state.isPlaying ? 'pause' : 'play'" :size="30" />
          </button>
          <button class="icon-btn fs-ctrl" :aria-label="t('player.next')" @click="player.next()">
            <AppIcon name="next" :size="26" />
          </button>
          <button
            class="icon-btn fs-ctrl"
            :class="{ active: player.state.repeat !== 'off' }"
            :aria-label="
              t('player.repeat', { mode: t(`player.repeatMode.${player.state.repeat}`) })
            "
            @click="player.cycleRepeat()"
          >
            <AppIcon :name="player.state.repeat === 'one' ? 'repeat-one' : 'repeat'" :size="20" />
          </button>
        </div>

        <div class="fs-volume">
          <button
            class="icon-btn"
            :aria-label="t('player.mute')"
            :aria-pressed="player.state.muted"
            @click="player.toggleMute()"
          >
            <AppIcon :name="volIcon" :size="18" />
          </button>
          <BaseSlider v-model="volumePercent" :max="100" :label="t('player.volume')" />
        </div>
      </template>
    </div>
  </div>
</template>
