<script setup lang="ts">
// Stats: what's in the library, and what you've actually listened to.
//
// Play counts come from Navidrome's own API, which only a password sign-in
// can use (client.getUserStats), so each card appears only if its figure is
// known, and a missing section says why. The last section is this browser's
// own play log, which works with any sign-in.
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import AsyncState from "@/components/base/AsyncState.vue";
import StatCardGrid from "@/components/library/StatCardGrid.vue";
import TopList from "@/components/library/TopList.vue";
import type { TopRow } from "@/components/library/topList";
import { formatListeningTime, formatNumber, formatRelativeDate } from "@/lib/format";
import { qk } from "@/lib/query";
import { libraryCards, listeningCards, localListening, type StatCard } from "@/lib/stats";
import { useHistoryStore } from "@/stores/history";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import "./stats.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const session = useSessionStore();
const player = usePlayerStore();
const history = useHistoryStore();

const library = useQuery(() => ({
  queryKey: qk.libraryStats(),
  queryFn: () => session.requireClient().getLibraryStats(),
  enabled: !!session.client,
}));

// The slow part (it walks every played track), so it's a query of its own and
// the library figures don't wait for it.
const listening = useQuery(() => ({
  queryKey: qk.userStats(),
  queryFn: () => session.requireClient().getUserStats(),
  enabled: !!session.client,
}));

const libCards = computed(() => libraryCards(library.data.value));
const listenCards = computed(() =>
  listeningCards(listening.data.value, library.data.value?.songCount),
);
const unavailableReason = computed(() => listening.data.value?.unavailableReason);

const stats = computed(() => listening.data.value);
const topSongRows = computed<TopRow[]>(() =>
  (stats.value?.topSongs ?? []).map((song) => ({
    key: song.id,
    title: song.title,
    subtitle: song.artist,
    coverArt: song.coverArt,
    plays: song.playCount,
    onClick: () => player.playNow([song]),
  })),
);
const topAlbumRows = computed<TopRow[]>(() =>
  (stats.value?.topAlbums ?? []).map(({ id, name, artist, coverArt, playCount }) => ({
    key: id,
    title: name,
    subtitle: artist,
    coverArt,
    plays: playCount,
    to: `/album/${id}`,
  })),
);
const topArtistRows = computed<TopRow[]>(() =>
  (stats.value?.topArtists ?? []).map(({ id, name, coverArt, playCount }) => ({
    key: id,
    title: name,
    coverArt,
    plays: playCount,
    to: `/artist/${id}`,
    round: true,
  })),
);
const hasTopLists = computed(() =>
  [topSongRows, topAlbumRows, topArtistRows].some((rows) => rows.value.length > 0),
);

const local = computed(() => localListening(history.entries));
const localCards = computed<StatCard[]>(() => {
  const log = local.value;
  return log
    ? [
        { icon: "waves", label: t("stats.playsLogged"), value: formatNumber(log.plays) },
        { icon: "list", label: t("stats.differentSongs"), value: formatNumber(log.tracks) },
        { icon: "mic", label: t("nav.artists"), value: formatNumber(log.artists) },
        { icon: "clock", label: t("stats.timeListened"), value: formatListeningTime(log.seconds) },
      ]
    : [];
});
const localSince = computed(() => formatRelativeDate(local.value?.since));
</script>

<template>
  <div class="page">
    <div class="list-header">
      <h1 class="page-title">{{ t("nav.stats") }}</h1>
    </div>

    <section class="stats-section">
      <h2 class="stats-heading">{{ t("stats.yourListening") }}</h2>
      <AsyncState :loading="listening.isLoading.value" :error="listening.error.value">
        <StatCardGrid v-if="listenCards.length > 0" :cards="listenCards" />
        <p v-else class="stats-note muted">
          {{ unavailableReason ?? t("stats.noPerUser") }}
        </p>

        <p v-if="listening.data.value?.approximate" class="stats-note muted">
          {{ t("stats.approximate") }}
        </p>
        <p v-if="listenCards.length > 0 && unavailableReason" class="stats-note muted">
          {{ unavailableReason }}
        </p>
      </AsyncState>
    </section>

    <section v-if="hasTopLists" class="stats-section">
      <h2 class="stats-heading">{{ t("albums.sort.frequent") }}</h2>
      <div class="top-lists">
        <TopList
          v-if="topSongRows.length > 0"
          icon="play"
          :title="t('stats.songs')"
          :rows="topSongRows"
        />
        <TopList
          v-if="topAlbumRows.length > 0"
          icon="disc"
          :title="t('nav.albums')"
          :rows="topAlbumRows"
        />
        <TopList
          v-if="topArtistRows.length > 0"
          icon="mic"
          :title="t('nav.artists')"
          :rows="topArtistRows"
        />
      </div>
    </section>

    <section class="stats-section">
      <h2 class="stats-heading">{{ t("palette.groupLibrary") }}</h2>
      <AsyncState :loading="library.isLoading.value" :error="library.error.value">
        <StatCardGrid :cards="libCards" />
        <p
          v-if="library.data.value && library.data.value.totalSize === undefined"
          class="stats-note muted"
        >
          {{ t("stats.sizeNeedsNative") }}
        </p>
      </AsyncState>
    </section>

    <section v-if="local" class="stats-section">
      <h2 class="stats-heading">{{ t("stats.inBrowser") }}</h2>
      <StatCardGrid :cards="localCards" />
      <p class="stats-note muted">
        {{ localSince ? t("stats.localSince", { date: localSince }) : t("stats.local") }}
        <RouterLink to="/history">{{ t("stats.seeLog") }}</RouterLink
        >.
      </p>
    </section>
  </div>
</template>
