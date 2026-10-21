<script setup lang="ts">
// Albums: a paginated, sortable grid of the whole library. The sort lives in
// the URL (?sort=) so "See all" links and Back work.
import { useInfiniteQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { AlbumListType } from "@/api/client";
import type { Album } from "@/api/types";
import AsyncState from "@/components/base/AsyncState.vue";
import AlbumCard from "@/components/library/AlbumCard.vue";
import { useSessionStore } from "@/stores/session";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const PAGE = 50;

const SORTS: { value: AlbumListType; label: `albums.sort.${string}` }[] = [
  { value: "newest", label: "albums.sort.newest" },
  { value: "recent", label: "albums.sort.recent" },
  { value: "frequent", label: "albums.sort.frequent" },
  { value: "alphabeticalByName", label: "albums.sort.name" },
  { value: "alphabeticalByArtist", label: "albums.sort.artist" },
  { value: "starred", label: "albums.sort.starred" },
  { value: "random", label: "albums.sort.random" },
];

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const sort = computed<AlbumListType>(() => {
  const s = route.query.sort;
  return SORTS.some((x) => x.value === s) ? (s as AlbumListType) : "newest";
});

const { data, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery(
  () => ({
    queryKey: ["albumList", sort.value, "page"],
    queryFn: ({ pageParam }: { pageParam: number }) =>
      session.requireClient().getAlbumList(sort.value, { size: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: Album[], allPages: Album[][]) =>
      lastPage.length === PAGE ? allPages.length * PAGE : undefined,
    enabled: !!session.client,
  }),
);

const albums = computed(() => data.value?.pages.flat() ?? []);

function setSort(e: Event): void {
  void router.replace({ query: { ...route.query, sort: (e.target as HTMLSelectElement).value } });
}
</script>

<template>
  <div class="page">
    <div class="list-header">
      <h1 class="page-title">{{ t("nav.albums") }}</h1>
      <select
        class="input list-sort"
        :value="sort"
        :aria-label="t('albums.sortLabel')"
        @change="setSort"
      >
        <option v-for="s in SORTS" :key="s.value" :value="s.value">{{ t(s.label) }}</option>
      </select>
    </div>

    <AsyncState
      :loading="isLoading"
      :error="error"
      :is-empty="albums.length === 0"
      :empty-message="t('albums.empty')"
    >
      <div class="grid">
        <AlbumCard v-for="album in albums" :key="album.id" :album="album" />
      </div>
      <div v-if="hasNextPage" class="load-more">
        <button class="btn" :disabled="isFetchingNextPage" @click="fetchNextPage()">
          {{ isFetchingNextPage ? t("common.loadingEllipsis") : t("common.loadMore") }}
        </button>
      </div>
    </AsyncState>
  </div>
</template>
