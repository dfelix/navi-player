<script setup lang="ts">
// Search results for ?q= in the address (the search box puts it there as you
// type). The server's matches are reranked to forgive typos, and artists are
// also matched against the full artist list.
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppIcon from "@/components/base/AppIcon.vue";
import AsyncState from "@/components/base/AsyncState.vue";
import AlbumCard from "@/components/library/AlbumCard.vue";
import ArtistCard from "@/components/library/ArtistCard.vue";
import SelectionBar from "@/components/library/SelectionBar.vue";
import SongList from "@/components/library/SongList.vue";
import { qk } from "@/lib/query";
import { searchLibrary } from "@/lib/librarySearch";
import { useSessionStore } from "@/stores/session";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const route = useRoute();
const session = useSessionStore();

const query = computed(() => String(route.query.q ?? "").trim());
const listId = computed(() => `search:${query.value}`);

// The full artist list — already cached for the Artists page — doubles as a
// typo-tolerant artist index the server search can't provide.
const artistsQ = useQuery(() => ({
  queryKey: qk.artists(),
  queryFn: () => session.requireClient().getArtists(),
  enabled: !!session.client && query.value.length > 0,
}));

const { data, isLoading, error } = useQuery(() => ({
  queryKey: [...qk.search(query.value), "smart"],
  queryFn: () => searchLibrary(session.requireClient(), query.value, artistsQ.data.value),
  // The artist list is waited for (it's cached after the first search), so
  // misspelt artists are there in the first results.
  enabled: !!session.client && query.value.length > 0 && !artistsQ.isPending.value,
}));

const artists = computed(() => data.value?.artist.slice(0, 12) ?? []);
const albums = computed(() => data.value?.album.slice(0, 12) ?? []);
const songs = computed(() => data.value?.song ?? []);
const empty = computed(() => !artists.value.length && !albums.value.length && !songs.value.length);
</script>

<template>
  <div class="page">
    <div v-if="query.length === 0" class="center-state">
      <AppIcon name="search" :size="30" />
      <p>{{ t("search.prompt") }}</p>
    </div>
    <template v-else>
      <h1 class="page-title results-title">{{ t("search.results", { query }) }}</h1>
      <AsyncState
        :loading="isLoading"
        :error="error"
        :is-empty="empty"
        :empty-message="t('search.nothingFound', { query })"
      >
        <template v-if="artists.length > 0">
          <h2 class="section-title">{{ t("nav.artists") }}</h2>
          <div class="grid section-gap">
            <ArtistCard v-for="a in artists" :key="a.id" :artist="a" />
          </div>
        </template>

        <template v-if="albums.length > 0">
          <h2 class="section-title">{{ t("nav.albums") }}</h2>
          <div class="grid section-gap">
            <AlbumCard v-for="a in albums" :key="a.id" :album="a" />
          </div>
        </template>

        <template v-if="songs.length > 0">
          <h2 class="section-title">{{ t("palette.groupTracks") }}</h2>
          <SongList
            :songs="songs"
            show-cover
            show-album
            show-header
            numbering="index"
            :selection-id="listId"
          />
          <SelectionBar :list-id="listId" :songs="songs" />
        </template>
      </AsyncState>
    </template>
  </div>
</template>

<style scoped>
.results-title {
  margin-bottom: 24px;
}
.section-gap {
  margin-bottom: 32px;
}
</style>
