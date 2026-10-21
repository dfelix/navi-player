<script setup lang="ts">
// Recap: a year-end-style summary of your listening, built only from what
// the server already knows.
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import CoverArt from "@/components/base/CoverArt.vue";
import AlbumCard from "@/components/library/AlbumCard.vue";
import { useDisplayName } from "@/composables/useDisplayName";
import { formatNumber } from "@/lib/format";
import { qk } from "@/lib/query";
import { topArtistsFromAlbums } from "@/lib/recap";
import { useSessionStore } from "@/stores/session";
import "./wrapped.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const session = useSessionStore();
const displayName = useDisplayName();
const api = () => session.requireClient();
const enabled = () => !!session.client;

// The most played albums, already in order. More are fetched than shown,
// because the top artists are worked out from them too.
const frequent = useQuery(() => ({
  queryKey: qk.albumList("frequent", { size: 60 }),
  queryFn: () => api().getAlbumList("frequent", { size: 60 }),
  enabled: enabled(),
}));
const recent = useQuery(() => ({
  queryKey: qk.albumList("recent", { size: 12 }),
  queryFn: () => api().getAlbumList("recent", { size: 12 }),
  enabled: enabled(),
}));
const artistsQ = useQuery(() => ({
  queryKey: qk.artists(),
  queryFn: () => api().getArtists(),
  enabled: enabled(),
}));
const genresQ = useQuery(() => ({
  queryKey: qk.genres(),
  queryFn: () => api().getGenres(),
  enabled: enabled(),
}));
const starredQ = useQuery(() => ({
  queryKey: qk.starred(),
  queryFn: () => api().getStarred(),
  enabled: enabled(),
}));

const topAlbums = computed(() => (frequent.data.value ?? []).slice(0, 12));
const topArtists = computed(() => topArtistsFromAlbums(frequent.data.value ?? []));
const recentAlbums = computed(() => recent.data.value ?? []);
const artistCount = computed(() => artistsQ.data.value?.length ?? 0);
const totalSongs = computed(() =>
  (genresQ.data.value ?? []).reduce((sum, g) => sum + (g.songCount ?? 0), 0),
);
const favourites = computed(() => {
  const s = starredQ.data.value;
  return s ? s.song.length + s.album.length + s.artist.length : 0;
});
const loading = computed(() => frequent.isLoading.value || artistsQ.isLoading.value);
const hasPlays = computed(() => (frequent.data.value ?? []).some((a) => (a.playCount ?? 0) > 0));
</script>

<template>
  <div class="page wrapped-page">
    <header class="wrapped-hero">
      <span class="wrapped-kicker">{{ t("recap.kicker") }}</span>
      <h1 class="wrapped-title">
        {{ displayName ? t("recap.titleNamed", { name: displayName }) : t("recap.title") }}
      </h1>
    </header>

    <div v-if="loading" class="center-state" role="status" :aria-label="t('common.loading')">
      <span class="spinner" />
    </div>
    <template v-else>
      <!-- A calm one-line summary instead of a dashboard of metric tiles. -->
      <i18n-t
        :keypath="favourites > 0 ? 'recap.ledeWithFavourites' : 'recap.lede'"
        tag="p"
        class="wrapped-lede"
      >
        <template #artists>
          <b>{{ formatNumber(artistCount) }}</b>
        </template>
        <template #songs>
          <b>{{ formatNumber(totalSongs) }}</b>
        </template>
        <template #favourites>
          <b>{{ formatNumber(favourites) }}</b>
        </template>
      </i18n-t>

      <div v-if="!hasPlays" class="wrapped-empty">
        <AppIcon name="trending" :size="32" />
        <p>
          {{ t("recap.empty") }}
        </p>
      </div>
      <template v-else>
        <section v-if="topArtists.length > 0" class="wrapped-section">
          <h2 class="section-title">{{ t("recap.topArtists") }}</h2>
          <div class="wrapped-artists">
            <RouterLink
              v-for="(artist, i) in topArtists"
              :key="artist.id ?? artist.name"
              class="wrapped-artist"
              :to="artist.id ? `/artist/${artist.id}` : '/artists'"
            >
              <span class="wrapped-rank">{{ i + 1 }}</span>
              <CoverArt
                :cover-art="artist.coverArt"
                :size="48"
                rounded
                alt=""
                class="wrapped-artist-art"
              />
              <span class="wrapped-artist-meta">
                <span class="wrapped-artist-name">{{ artist.name }}</span>
                <span class="wrapped-artist-plays muted">{{
                  t("recap.plays", { n: formatNumber(artist.plays) }, artist.plays)
                }}</span>
              </span>
            </RouterLink>
          </div>
        </section>

        <section class="wrapped-section">
          <h2 class="section-title">{{ t("recap.topAlbums") }}</h2>
          <div class="grid">
            <AlbumCard v-for="album in topAlbums" :key="album.id" :album="album" />
          </div>
        </section>
      </template>

      <section v-if="recentAlbums.length > 0" class="wrapped-section">
        <h2 class="section-title">{{ t("home.recentlyPlayed") }}</h2>
        <div class="carousel">
          <AlbumCard v-for="album in recentAlbums" :key="album.id" :album="album" />
        </div>
      </section>
    </template>
  </div>
</template>
