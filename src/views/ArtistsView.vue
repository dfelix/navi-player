<script setup lang="ts">
// Every artist in the library, as round tiles.
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import AsyncState from "@/components/base/AsyncState.vue";
import ArtistCard from "@/components/library/ArtistCard.vue";
import { qk } from "@/lib/query";
import { useSessionStore } from "@/stores/session";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const session = useSessionStore();
const { data, isLoading, error } = useQuery(() => ({
  queryKey: qk.artists(),
  queryFn: () => session.requireClient().getArtists(),
  enabled: !!session.client,
}));

const artists = computed(() =>
  [...(data.value ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
);
</script>

<template>
  <div class="page">
    <div class="list-header">
      <h1 class="page-title">{{ t("nav.artists") }}</h1>
    </div>
    <AsyncState :loading="isLoading" :error="error" :is-empty="artists.length === 0">
      <div class="grid">
        <ArtistCard v-for="artist in artists" :key="artist.id" :artist="artist" />
      </div>
    </AsyncState>
  </div>
</template>
