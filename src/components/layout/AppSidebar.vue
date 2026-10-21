<script setup lang="ts">
// The sidebar: the main pages, your playlists (each one a drop target for
// dragged tracks), and your account with settings and sign-out at the bottom.
import { useQuery } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import AppIcon from "@/components/base/AppIcon.vue";
import type { IconName } from "@/components/base/icons";
import logoUrl from "@/assets/logo.svg";
import { APP_NAME } from "@/lib/branding";
import { readSongIds, SONGS_MIME } from "@/lib/dragSongs";
import { log } from "@/lib/log";
import { qk, queryClient } from "@/lib/query";
import { useServerConfigStore } from "@/stores/serverConfig";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";
import "./sidebar.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

type Page = "home" | "albums" | "artists" | "genres" | "favourites" | "history" | "recap" | "stats";

// [path, page, icon]. The page name doubles as its translation key.
const NAV = (
  [
    ["/", "home", "home"],
    ["/albums", "albums", "disc"],
    ["/artists", "artists", "mic"],
    ["/genres", "genres", "tag"],
    ["/favourites", "favourites", "heart"],
    ["/history", "history", "clock"],
    ["/recap", "recap", "trending"],
    ["/stats", "stats", "server"],
  ] as [string, Page, IconName][]
).map(([to, page, icon]) => ({ to, label: `nav.${page}` as const, icon, exact: to === "/" }));

const router = useRouter();
const session = useSessionStore();
const serverConfig = useServerConfigStore();
const ui = useUiStore();

const creating = ref(false);
const newName = ref("");

const { data: playlists } = useQuery(() => ({
  queryKey: qk.playlists(),
  queryFn: () => session.requireClient().getPlaylists(),
  enabled: !!session.client,
}));

// Your own playlists only. Navidrome also lists everyone else's public ones,
// which would be a surprise on a shared server.
const myPlaylists = computed(() => {
  const me = session.client?.username;
  return (playlists.value ?? []).filter(({ owner }) => !me || !owner || owner === me);
});

const serverLabel = computed(() => session.apiBase?.replace(/^https?:\/\//, "") ?? "");

const refreshPlaylists = (...ids: string[]) => {
  void queryClient.invalidateQueries({ queryKey: qk.playlists() });
  ids.forEach((id) => void queryClient.invalidateQueries({ queryKey: qk.playlist(id) }));
};

function closeDrawer(): void {
  ui.drawerOpen = false;
}

async function createPlaylist(): Promise<void> {
  const name = newName.value.trim();
  if (!name) return;
  await session.requireClient().createPlaylist(name);
  newName.value = "";
  creating.value = false;
  refreshPlaylists();
}

// Tracks dropped on a playlist. The list is fetched again afterwards, so the
// count shows what the server actually added.
async function addDropped(id: string, name: string, songIds: string[]): Promise<void> {
  const client = session.client;
  if (!client || songIds.length === 0) return;
  try {
    await client.updatePlaylist(id, { songIdToAdd: songIds });
    refreshPlaylists(id);
    log.info("playlists", `added ${songIds.length} track(s) to ${name}`);
  } catch (err) {
    log.error("playlists", `could not add to ${name}`, err);
  }
}

// Only tracks dragged from the app are accepted; anything else is left to the
// browser.
function onDragOver(event: DragEvent, id: string): void {
  const transfer = event.dataTransfer;
  if (!transfer?.types.includes(SONGS_MIME)) return;
  event.preventDefault();
  transfer.dropEffect = "copy";
  ui.playlistDropTarget = id;
}

function onDrop(event: DragEvent, id: string, name: string): void {
  event.preventDefault();
  ui.playlistDropTarget = null;
  void addDropped(id, name, readSongIds(event.dataTransfer));
}

function openSettings(): void {
  closeDrawer();
  void router.push("/settings");
}
</script>

<template>
  <nav class="sidebar">
    <div class="sidebar-inner">
      <RouterLink to="/" class="sidebar-brand" @click="closeDrawer">
        <img class="sidebar-logo" :src="logoUrl" alt="" width="36" height="36" />
        <span class="sidebar-brand-name">{{ APP_NAME }}</span>
      </RouterLink>

      <div class="sidebar-nav">
        <RouterLink
          v-for="item in NAV"
          :key="item.to"
          :to="item.to"
          class="sidebar-link"
          :active-class="item.exact ? '' : 'sidebar-link-active'"
          exact-active-class="sidebar-link-active"
          @click="closeDrawer"
        >
          <AppIcon :name="item.icon" :size="19" />
          <span>{{ t(item.label) }}</span>
        </RouterLink>
      </div>

      <div class="sidebar-playlists">
        <div class="sidebar-section-head">
          <span>{{ t("nav.playlists") }}</span>
          <button
            class="icon-btn sidebar-add"
            :aria-label="t('nav.newPlaylist')"
            @click="creating = !creating"
          >
            <AppIcon name="plus" :size="16" />
          </button>
        </div>

        <form v-if="creating" class="sidebar-new" @submit.prevent="createPlaylist">
          <input
            v-model="newName"
            class="input"
            :placeholder="t('nav.playlistName')"
            :aria-label="t('nav.playlistName')"
            autofocus
          />
        </form>

        <div class="sidebar-playlist-list">
          <RouterLink
            v-for="pl in myPlaylists"
            :key="pl.id"
            :to="`/playlist/${pl.id}`"
            class="sidebar-link sidebar-playlist"
            :class="{ 'sidebar-playlist-drop': ui.playlistDropTarget === pl.id }"
            active-class="sidebar-link-active"
            @click="closeDrawer"
            @dragover="onDragOver($event, pl.id)"
            @dragleave="ui.playlistDropTarget = null"
            @drop="onDrop($event, pl.id, pl.name)"
          >
            <AppIcon name="list" :size="17" />
            <span class="sidebar-playlist-name">{{ pl.name }}</span>
            <AppIcon v-if="pl.public" name="globe" :size="13" class="sidebar-playlist-public" />
          </RouterLink>
          <p v-if="playlists && myPlaylists.length === 0" class="sidebar-empty muted">
            {{ t("nav.noPlaylists") }}
          </p>
        </div>
      </div>

      <div class="sidebar-foot">
        <button class="sidebar-account" @click="openSettings">
          <span class="sidebar-account-info">
            <span class="sidebar-account-user">{{ session.username }}</span>
            <span class="sidebar-account-server muted">{{ serverLabel }}</span>
          </span>
        </button>
        <button
          v-if="session.isAdmin && serverConfig.uploadEnabled"
          class="icon-btn"
          :aria-label="t('nav.uploadMusic')"
          :title="t('nav.uploadMusic')"
          @click="
            closeDrawer();
            ui.uploadOpen = true;
          "
        >
          <AppIcon name="upload" :size="19" />
        </button>
        <RouterLink
          to="/settings"
          class="icon-btn"
          :aria-label="t('nav.settings')"
          :title="t('nav.settings')"
          @click="closeDrawer"
        >
          <AppIcon name="settings" :size="19" />
        </RouterLink>
        <button
          class="icon-btn"
          :aria-label="t('nav.logOut')"
          :title="t('nav.logOut')"
          @click="session.logout()"
        >
          <AppIcon name="logout" :size="19" />
        </button>
      </div>
    </div>
  </nav>
</template>
