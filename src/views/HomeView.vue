<script setup lang="ts">
// Home: album carousels drawn straight from the library — recently added, most
// played, recently played, and a random shuffle — plus Surprise Me.
import { ref } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AlbumCarousel from "@/components/library/AlbumCarousel.vue";
import { useDisplayName } from "@/composables/useDisplayName";
import { surpriseMe } from "@/services/playback";
import { useSessionStore } from "@/stores/session";
import "./home.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const session = useSessionStore();
const displayName = useDisplayName();

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
    <AlbumCarousel :title="t('home.randomAlbums')" type="random" to="/albums?sort=random" />
  </div>
</template>
