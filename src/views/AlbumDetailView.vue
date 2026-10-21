<script setup lang="ts">
// An album: cover and details over a backdrop in the cover's colours, the
// actions, then its tracks (with a heading per disc when there's more than one).
import { useQuery } from "@tanstack/vue-query";
import { computed, nextTick, ref, watch, watchEffect } from "vue";
import { useRoute } from "vue-router";
import AppIcon from "@/components/base/AppIcon.vue";
import AsyncState from "@/components/base/AsyncState.vue";
import CoverArt from "@/components/base/CoverArt.vue";
import MenuButton from "@/components/base/MenuButton.vue";
import type { ActionItem } from "@/components/base/menu";
import SelectionBar from "@/components/library/SelectionBar.vue";
import SongList from "@/components/library/SongList.vue";
import { diagonalBlend, pickDistinct, readCoverColours } from "@/lib/artColours";
import { formatCount, formatLongDuration } from "@/lib/format";
import { qk } from "@/lib/query";
import { shuffled } from "@/lib/shuffle";
import { playInstantMix } from "@/services/playback";
import { shareLink } from "@/services/share";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { useStarsStore } from "@/stores/stars";
import { useUiStore } from "@/stores/ui";
import "./album.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const route = useRoute();
const session = useSessionStore();
const player = usePlayerStore();
const stars = useStarsStore();
const ui = useUiStore();

const id = computed(() => String(route.params.id));
const listId = computed(() => `album:${id.value}`);
// A shared song link arrives as /album/<id>?track=<songId>: that track is
// highlighted and scrolled to once the list is on screen.
const highlightId = computed(() => (route.query.track ? String(route.query.track) : undefined));

const {
  data: album,
  isLoading,
  error,
} = useQuery(() => ({
  queryKey: qk.album(id.value),
  queryFn: () => session.requireClient().getAlbum(id.value),
  enabled: !!session.client,
}));

const songs = computed(() => album.value?.song ?? []);
// Tracks by disc, discs in order (one group for a single-disc album).
const discs = computed(() => {
  const numbers = [...new Set(songs.value.map((song) => song.discNumber ?? 1))].sort(
    (a, b) => a - b,
  );
  return numbers.map((disc) => ({
    disc,
    songs: songs.value.filter((song) => (song.discNumber ?? 1) === disc),
  }));
});
const isCurrentAlbum = computed(() => songs.value.some((s) => s.id === player.current?.id));
const playingThis = computed(() => player.state.isPlaying && isCurrentAlbum.value);
const starred = computed(
  () => !!album.value && stars.isStarred(album.value.id, album.value.starred),
);

watch([highlightId, () => songs.value.length], async ([track, count]) => {
  if (!track || !count) return;
  await nextTick();
  const row = document.querySelector(`[data-song-id="${CSS.escape(track)}"]`);
  row?.scrollIntoView({ behavior: "smooth", block: "center" });
});

// The backdrop's colours, from the cover. Only possible when the cover can be
// read (same origin, or a server that allows it); otherwise there's none.
const gradient = ref<string | null>(null);
watchEffect(() => {
  const art = album.value?.coverArt;
  const c = session.client;
  gradient.value = null;
  if (!art || !c) return;
  readCoverColours(c.coverArtUrl(art, 256))
    .then(({ swatches }) => {
      gradient.value = diagonalBlend(pickDistinct(swatches, 3)) || null;
    })
    .catch(() => (gradient.value = null));
});

function playOrPause(): void {
  if (isCurrentAlbum.value) player.togglePlay();
  else player.playNow(songs.value, 0);
}

const actions = computed<ActionItem[]>(() => {
  const a = album.value;
  if (!a) return [];
  return [
    {
      label: t("player.shuffle"),
      icon: "shuffle",
      onSelect: () => player.playNow(shuffled(songs.value), 0),
    },
    {
      label: t("common.startRadio"),
      icon: "radio",
      onSelect: () => void playInstantMix(a.id, "album"),
    },
    { label: t("common.playNext"), icon: "next", onSelect: () => player.playNext(songs.value) },
    {
      label: t("common.addToQueue"),
      icon: "queue",
      onSelect: () => player.addToQueue(songs.value),
    },
    {
      label: t("common.addToPlaylist"),
      icon: "plus",
      onSelect: () => ui.openAddToPlaylist(songs.value.map((s) => s.id)),
      separatorBefore: true,
    },
    {
      label: t("common.share"),
      icon: "share",
      onSelect: () =>
        void shareLink(`/album/${a.id}`, a.artist ? `${a.name} — ${a.artist}` : a.name),
      separatorBefore: true,
    },
    {
      label: t("common.download"),
      icon: "download",
      onSelect: () =>
        ui.openDownload({
          kind: "album",
          id: a.id,
          name: a.name,
          artist: a.artist,
          songs: songs.value,
        }),
    },
  ];
});
</script>

<template>
  <div class="page album-page">
    <div
      v-if="gradient"
      class="album-backdrop"
      :style="{ backgroundImage: gradient }"
      aria-hidden="true"
    />
    <AsyncState :loading="isLoading" :error="error">
      <template v-if="album">
        <header class="detail-head">
          <div class="detail-art">
            <CoverArt :cover-art="album.coverArt" :alt="album.name" />
          </div>
          <div class="detail-info">
            <span class="detail-kind">{{ t("album.kind") }}</span>
            <h1 class="detail-title">{{ album.name }}</h1>
            <div class="detail-sub">
              <RouterLink v-if="album.artistId" :to="`/artist/${album.artistId}`">{{
                album.artist
              }}</RouterLink>
              <span v-else>{{ album.artist }}</span>
              <span v-if="album.year" class="detail-dot">{{ album.year }}</span>
              <span class="detail-dot">{{ formatCount(songs.length, "track") }}</span>
              <span class="detail-dot">{{ formatLongDuration(album.duration) }}</span>
            </div>
          </div>
        </header>

        <div class="detail-actions">
          <button class="play-big" @click="playOrPause">
            <AppIcon :name="playingThis ? 'pause' : 'play'" :size="20" class="play-big-icon" />
            {{ playingThis ? t("common.pause") : t("common.play") }}
          </button>
          <button
            class="icon-btn"
            :class="{ active: starred }"
            :aria-label="starred ? t('album.unfavourite') : t('album.favourite')"
            :aria-pressed="starred"
            @click="stars.toggle(album.id, album.starred, 'album')"
          >
            <AppIcon :name="starred ? 'heart-filled' : 'heart'" :size="22" />
          </button>
          <MenuButton :items="actions" />
        </div>

        <SongList
          v-if="discs.length <= 1"
          :songs="songs"
          show-header
          numbering="track"
          :highlight-id="highlightId"
          :selection-id="listId"
        />
        <template v-for="group in discs" v-else :key="group.disc">
          <div class="disc-divider">
            <AppIcon name="disc" :size="14" /> {{ t("album.disc", { n: group.disc }) }}
          </div>
          <!-- Every disc shares the album's selection id and is told where it
               sits in the full tracklist, so a shift-click range spans disc
               boundaries correctly. -->
          <SongList
            :songs="group.songs"
            numbering="track"
            :highlight-id="highlightId"
            :selection-id="listId"
            :selection-context="songs"
            :selection-offset="songs.indexOf(group.songs[0]!)"
          />
        </template>
        <SelectionBar :list-id="listId" :songs="songs" />
      </template>
    </AsyncState>
  </div>
</template>
