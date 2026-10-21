<script setup lang="ts">
// The signed-in app: sidebar, the page (with the search bar on top), the queue
// or lyrics panel, and the player bar, plus the dialogs and keyboard handling
// that work everywhere.
import { computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppIcon from "@/components/base/AppIcon.vue";
import ErrorBoundary from "@/components/base/ErrorBoundary.vue";
import AddToPlaylistDialog from "@/components/dialogs/AddToPlaylistDialog.vue";
import DownloadDialog from "@/components/dialogs/DownloadDialog.vue";
import ShortcutsHelpDialog from "@/components/dialogs/ShortcutsHelpDialog.vue";
import UploadDialog from "@/components/dialogs/UploadDialog.vue";
import FullScreenPlayer from "@/components/player/FullScreenPlayer.vue";
import LyricsPanel from "@/components/player/LyricsPanel.vue";
import NowPlayingBar from "@/components/player/NowPlayingBar.vue";
import QueuePanel from "@/components/player/QueuePanel.vue";
import { useShortcuts } from "@/composables/useShortcuts";
import { useSpatialNav } from "@/composables/useSpatialNav";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import AppSidebar from "./AppSidebar.vue";
import AppToast from "./AppToast.vue";
import CommandPalette from "./CommandPalette.vue";
import MobileNav from "./MobileNav.vue";
import TopBar from "./TopBar.vue";
import "./shell.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// Where "Start on" (Settings → Appearance) takes you when the app opens.
const START_PAGES: Record<string, string> = {
  albums: "/albums",
  artists: "/artists",
  "recently-added": "/albums?sort=newest",
  "recently-played": "/albums?sort=recent",
};

useShortcuts();
useSpatialNav();

const route = useRoute();
const router = useRouter();
const settings = useSettingsStore();
const ui = useUiStore();

const sidePanel = computed(() => settings.layout.showQueuePanel || settings.layout.showLyricsPanel);

// Only when the app opens on the home page, and only once.
onMounted(async () => {
  await router.isReady();
  const start = START_PAGES[settings.layout.defaultLanding];
  if (route.path === "/" && start) void router.replace(start);
});

// On phones, following a link in the drawer closes it.
watch(
  () => route.path,
  () => void (ui.drawerOpen = false),
);

function toggleSidebar(): void {
  settings.update((s) => void (s.layout.showSidebar = !s.layout.showSidebar));
}
</script>

<template>
  <div
    class="app-shell"
    :class="{
      'app-shell-side': sidePanel,
      'app-shell-collapsed': !settings.layout.showSidebar,
      'app-shell-drawer-open': ui.drawerOpen,
    }"
  >
    <AppSidebar />
    <!-- Dimming scrim behind the drawer on mobile; tap to close. -->
    <button class="drawer-scrim" :aria-label="t('nav.closeMenu')" @click="ui.drawerOpen = false" />
    <button
      class="sidebar-edge"
      :aria-label="settings.layout.showSidebar ? t('nav.hideSidebar') : t('nav.showSidebar')"
      :title="settings.layout.showSidebar ? t('nav.hideSidebar') : t('nav.showSidebar')"
      @click="toggleSidebar"
    >
      <span class="sidebar-edge-chevron">
        <AppIcon name="chevron-right" :size="15" />
      </span>
    </button>
    <CommandPalette />
    <main class="app-content">
      <TopBar />
      <div class="app-scroll">
        <RouterView v-slot="{ Component }">
          <!-- Re-keyed on the path (not the query) so each navigation replays a
               quiet entrance, but in-page changes like ?sort= don't. -->
          <div :key="route.path" class="route-view">
            <!-- A page that throws must not take the sidebar and now-playing
                 bar down with it — playback keeps going. -->
            <ErrorBoundary>
              <component :is="Component" />
            </ErrorBoundary>
          </div>
        </RouterView>
      </div>
    </main>
    <div class="side-panel-wrapper">
      <div
        class="side-panel-item"
        :class="{ 'side-panel-item-active': settings.layout.showQueuePanel }"
      >
        <QueuePanel />
      </div>
      <div
        class="side-panel-item"
        :class="{
          'side-panel-item-active':
            !settings.layout.showQueuePanel && settings.layout.showLyricsPanel,
        }"
      >
        <LyricsPanel />
      </div>
    </div>
    <NowPlayingBar />
    <MobileNav />
    <FullScreenPlayer v-if="ui.fullScreen" />
    <AddToPlaylistDialog />
    <DownloadDialog />
    <AppToast />
    <ShortcutsHelpDialog />
    <UploadDialog v-if="ui.uploadOpen" @close="ui.uploadOpen = false" />
  </div>
</template>
