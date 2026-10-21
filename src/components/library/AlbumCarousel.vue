<script setup lang="ts">
// One horizontally-scrolling row of albums from a server album list, with a
// "See all" link to the full sorted grid. Renders nothing when the list is empty.
import { useQuery } from "@tanstack/vue-query";
import type { AlbumListType } from "@/api/client";
import AppIcon from "@/components/base/AppIcon.vue";
import { qk } from "@/lib/query";
import { useSessionStore } from "@/stores/session";
import AlbumCard from "./AlbumCard.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{ title: string; type: AlbumListType; to: string }>();

const session = useSessionStore();
const { data: albums } = useQuery(() => ({
  queryKey: qk.albumList(props.type, { size: 14 }),
  queryFn: () => session.requireClient().getAlbumList(props.type, { size: 14 }),
  enabled: !!session.client,
}));
</script>

<template>
  <section v-if="albums && albums.length > 0" class="home-section">
    <div class="home-section-head">
      <h2 class="section-title">{{ title }}</h2>
      <RouterLink :to="to" class="home-seeall">
        {{ t("common.seeAll") }} <AppIcon name="chevron-right" :size="14" />
      </RouterLink>
    </div>
    <div class="carousel">
      <AlbumCard v-for="album in albums" :key="album.id" :album="album" />
    </div>
  </section>
</template>
