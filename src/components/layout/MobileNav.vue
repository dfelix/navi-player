<script setup lang="ts">
// The tab bar along the bottom on phones: the main places within thumb's
// reach, and "More" for the drawer with everything else.
import AppIcon from "@/components/base/AppIcon.vue";
import type { IconName } from "@/components/base/icons";
import { useUiStore } from "@/stores/ui";
import "./mobilenav.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const TABS: {
  to: string;
  label: `nav.${"home" | "albums" | "artists" | "favourites"}`;
  icon: IconName;
  exact?: boolean;
}[] = [
  { to: "/", label: "nav.home", icon: "home", exact: true },
  { to: "/albums", label: "nav.albums", icon: "disc" },
  { to: "/artists", label: "nav.artists", icon: "mic" },
  { to: "/favourites", label: "nav.favourites", icon: "heart" },
];

const ui = useUiStore();
</script>

<template>
  <nav class="mobile-nav" :aria-label="t('nav.primary')">
    <RouterLink
      v-for="tab in TABS"
      :key="tab.to"
      :to="tab.to"
      class="mobile-nav-item"
      :active-class="tab.exact ? '' : 'mobile-nav-item-active'"
      exact-active-class="mobile-nav-item-active"
      @click="ui.drawerOpen = false"
    >
      <AppIcon :name="tab.icon" :size="22" />
      <span>{{ t(tab.label) }}</span>
    </RouterLink>
    <button class="mobile-nav-item" :aria-label="t('nav.more')" @click="ui.drawerOpen = true">
      <AppIcon name="menu" :size="22" />
      <span>{{ t("nav.more") }}</span>
    </button>
  </nav>
</template>
