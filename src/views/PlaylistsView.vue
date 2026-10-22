<script setup lang="ts">
// Playlists: yours, then the public ones other people on the server have made.
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import AsyncState from "@/components/base/AsyncState.vue";
import PlaylistCard from "@/components/library/PlaylistCard.vue";
import { splitPlaylists } from "@/lib/playlists";
import { qk } from "@/lib/query";
import { useSessionStore } from "@/stores/session";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const session = useSessionStore();
const { data, isLoading, error } = useQuery(() => ({
  queryKey: qk.playlists(),
  queryFn: () => session.requireClient().getPlaylists(),
  enabled: !!session.client,
}));

const split = computed(() => splitPlaylists(data.value ?? [], session.client?.username));
const empty = computed(() => !split.value.mine.length && !split.value.others.length);
</script>

<template>
  <div class="page">
    <div class="list-header">
      <h1 class="page-title">{{ t("nav.playlists") }}</h1>
    </div>
    <AsyncState
      :loading="isLoading"
      :error="error"
      :is-empty="empty"
      :empty-message="t('nav.noPlaylists')"
    >
      <template v-if="split.mine.length > 0">
        <h2 class="section-title">{{ t("playlist.yours") }}</h2>
        <div class="grid section-gap">
          <PlaylistCard v-for="pl in split.mine" :key="pl.id" :playlist="pl" />
        </div>
      </template>

      <template v-if="split.others.length > 0">
        <h2 class="section-title">{{ t("playlist.publicByOthers") }}</h2>
        <div class="grid section-gap">
          <PlaylistCard v-for="pl in split.others" :key="pl.id" :playlist="pl" />
        </div>
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.section-gap {
  margin-bottom: 32px;
}
</style>
