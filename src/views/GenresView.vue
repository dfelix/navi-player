<script setup lang="ts">
// Genres: tiles sorted by album count, linking to a genre's tracks.
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import AsyncState from "@/components/base/AsyncState.vue";
import { formatCount } from "@/lib/format";
import { qk } from "@/lib/query";
import { useSessionStore } from "@/stores/session";
import "./genres.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const session = useSessionStore();
const { data, isLoading, error } = useQuery(() => ({
  queryKey: qk.genres(),
  queryFn: () => session.requireClient().getGenres(),
  enabled: !!session.client,
}));

const genres = computed(() =>
  [...(data.value ?? [])].filter((g) => g.value).sort((a, b) => b.albumCount - a.albumCount),
);
</script>

<template>
  <div class="page">
    <div class="list-header">
      <h1 class="page-title">{{ t("nav.genres") }}</h1>
    </div>
    <AsyncState :loading="isLoading" :error="error" :is-empty="genres.length === 0">
      <div class="genre-grid">
        <RouterLink
          v-for="g in genres"
          :key="g.value"
          :to="`/genre/${encodeURIComponent(g.value)}`"
          class="genre-tile"
        >
          <span class="genre-name">{{ g.value }}</span>
          <span class="genre-count muted">{{ formatCount(g.albumCount, "album") }}</span>
        </RouterLink>
      </div>
    </AsyncState>
  </div>
</template>
