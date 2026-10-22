<script setup lang="ts">
// Home: album carousels drawn straight from the library — recently added, most
// played, recently played, and a random shuffle — other people's public
// playlists, and Surprise Me.
import { useQuery } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AlbumCarousel from "@/components/library/AlbumCarousel.vue";
import PlaylistCard from "@/components/library/PlaylistCard.vue";
import { useDisplayName } from "@/composables/useDisplayName";
import { splitPlaylists } from "@/lib/playlists";
import { qk } from "@/lib/query";
import { surpriseMe } from "@/services/playback";
import { useSessionStore } from "@/stores/session";
import "./home.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const session = useSessionStore();
const displayName = useDisplayName();

// The same list as the sidebar's (and the same cache); Home shows the public
// ones other people have made. Yours are in the sidebar.
const { data: playlists } = useQuery(() => ({
  queryKey: qk.playlists(),
  queryFn: () => session.requireClient().getPlaylists(),
  enabled: !!session.client,
}));
const publicPlaylists = computed(
  () => splitPlaylists(playlists.value ?? [], session.client?.username).others,
);

// Up to (not including) each hour, which greeting. After 22:00 and before
// 05:00 it's the late-night one.
const GREETINGS: [beforeHour: number, key: string][] = [
  [5, "home.lateNight"],
  [12, "home.morning"],
  [18, "home.afternoon"],
  [22, "home.evening"],
  [24, "home.lateNight"],
];

function greeting(): string {
  const hour = new Date().getHours();
  return t(GREETINGS.find(([before]) => hour < before)![1]);
}

const picking = ref(false);
async function pick(): Promise<void> {
  if (picking.value) return;
  picking.value = true;
  try {
    await surpriseMe();
  } finally {
    picking.value = false;
  }
}
</script>

<template>
  <div class="page">
    <div class="home-header">
      <h1 class="page-title home-greeting">
        {{ greeting() }}<template v-if="displayName">, {{ displayName }}</template>
      </h1>
      <button
        class="btn btn-primary home-surprise"
        :disabled="picking || !session.client"
        @click="pick"
      >
        <AppIcon name="sparkles" :size="16" />
        {{ picking ? t("home.pickingSurprise") : t("home.surpriseMe") }}
      </button>
    </div>
    <AlbumCarousel :title="t('home.recentlyAdded')" type="newest" to="/albums?sort=newest" />
    <AlbumCarousel :title="t('albums.sort.frequent')" type="frequent" to="/albums?sort=frequent" />
    <AlbumCarousel :title="t('home.recentlyPlayed')" type="recent" to="/albums?sort=recent" />
    <section v-if="publicPlaylists.length > 0" class="home-section">
      <div class="home-section-head">
        <h2 class="section-title">{{ t("home.publicPlaylists") }}</h2>
        <RouterLink to="/playlists" class="home-seeall">
          {{ t("common.seeAll") }} <AppIcon name="chevron-right" :size="14" />
        </RouterLink>
      </div>
      <div class="carousel">
        <PlaylistCard v-for="pl in publicPlaylists" :key="pl.id" :playlist="pl" />
      </div>
    </section>
    <AlbumCarousel :title="t('home.randomAlbums')" type="random" to="/albums?sort=random" />
  </div>
</template>
