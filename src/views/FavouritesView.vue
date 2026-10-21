<script setup lang="ts">
// Your favourite songs, albums and artists. They're kept by Navidrome,
// so they're the same on every device and app.
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AsyncState from "@/components/base/AsyncState.vue";
import AlbumCard from "@/components/library/AlbumCard.vue";
import ArtistCard from "@/components/library/ArtistCard.vue";
import SelectionBar from "@/components/library/SelectionBar.vue";
import SongList from "@/components/library/SongList.vue";
import { qk } from "@/lib/query";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const session = useSessionStore();
const player = usePlayerStore();

const { data, isLoading, error } = useQuery(() => ({
  queryKey: qk.starred(),
  queryFn: () => session.requireClient().getStarred(),
  enabled: !!session.client,
}));

const artists = computed(() => data.value?.artist ?? []);
const albums = computed(() => data.value?.album ?? []);
const songs = computed(() => data.value?.song ?? []);
const empty = computed(() => !artists.value.length && !albums.value.length && !songs.value.length);
</script>

<template>
  <div class="page">
    <div class="list-header">
      <h1 class="page-title">{{ t("nav.favourites") }}</h1>
    </div>
    <AsyncState
      :loading="isLoading"
      :error="error"
      :is-empty="empty"
      :empty-message="t('favourites.empty')"
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
        <div class="list-header tracks-header">
          <h2 class="section-title">{{ t("palette.groupTracks") }}</h2>
          <button class="btn" @click="player.playNow(songs, 0)">
            <AppIcon name="play" :size="16" /> {{ t("favourites.playAll") }}
          </button>
        </div>
        <SongList
          :songs="songs"
          show-cover
          show-album
          show-header
          numbering="index"
          selection-id="favourites"
        />
        <SelectionBar list-id="favourites" :songs="songs" />
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.section-gap {
  margin-bottom: 32px;
}
.tracks-header {
  margin-top: 8px;
}
.tracks-header .section-title {
  margin-bottom: 0;
}
</style>
