<script setup lang="ts">
// The global "add to playlist" dialog. Track/album menus call
// useUiStore().openAddToPlaylist(songIds); this dialog (mounted once in the
// shell) handles picking an existing playlist or creating a new one.
import { useQuery } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import BaseDialog from "@/components/base/BaseDialog.vue";
import { formatCount } from "@/lib/format";
import { qk, queryClient } from "@/lib/query";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";
import "./addToPlaylist.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const session = useSessionStore();
const ui = useUiStore();

const newName = ref("");
const busy = ref(false);

const open = computed({
  get: () => ui.addToPlaylistIds !== null,
  set: (v) => {
    if (!v) ui.addToPlaylistIds = null;
  },
});

watch(open, (v) => {
  if (v) newName.value = "";
});

const { data: playlists } = useQuery(() => ({
  queryKey: qk.playlists(),
  queryFn: () => session.requireClient().getPlaylists(),
  enabled: !!session.client,
}));

// Your playlists only: you can't add to anyone else's.
const mine = computed(() => {
  const me = session.client?.username;
  return (playlists.value ?? []).filter((pl) => !me || !pl.owner || pl.owner === me);
});

async function addToExisting(id: string, name: string): Promise<void> {
  const ids = ui.addToPlaylistIds;
  if (!ids) return;
  busy.value = true;
  try {
    await session.requireClient().updatePlaylist(id, { songIdToAdd: ids });
    void queryClient.invalidateQueries({ queryKey: qk.playlist(id) });
    void queryClient.invalidateQueries({ queryKey: qk.playlists() });
    ui.showToast(t("addToPlaylist.added", { tracks: formatCount(ids.length, "track"), name }));
    ui.addToPlaylistIds = null;
  } finally {
    busy.value = false;
  }
}

async function createAndAdd(): Promise<void> {
  const ids = ui.addToPlaylistIds;
  const name = newName.value.trim();
  if (!ids || !name) return;
  busy.value = true;
  try {
    await session.requireClient().createPlaylist(name, ids);
    void queryClient.invalidateQueries({ queryKey: qk.playlists() });
    ui.showToast(t("addToPlaylist.created", { tracks: formatCount(ids.length, "track"), name }));
    ui.addToPlaylistIds = null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="t('addToPlaylist.title')" content-class="atp-dialog">
    <form class="atp-new" @submit.prevent="createAndAdd">
      <input
        v-model="newName"
        class="input"
        :placeholder="t('addToPlaylist.newName')"
        :aria-label="t('addToPlaylist.newName')"
      />
      <button class="btn btn-primary" type="submit" :disabled="busy || !newName.trim()">
        <AppIcon name="plus" :size="16" /> {{ t("addToPlaylist.create") }}
      </button>
    </form>

    <div class="atp-divider">
      <span>{{ t("addToPlaylist.orExisting") }}</span>
    </div>

    <div class="atp-list">
      <template v-if="mine.length > 0">
        <button
          v-for="pl in mine"
          :key="pl.id"
          class="atp-item"
          :disabled="busy"
          @click="addToExisting(pl.id, pl.name)"
        >
          <AppIcon name="list" :size="16" />
          <span class="atp-item-name">{{ pl.name }}</span>
          <span class="muted">{{ formatCount(pl.songCount ?? 0, "track") }}</span>
        </button>
      </template>
      <p v-else class="muted atp-empty">{{ t("nav.noPlaylists") }}</p>
    </div>
  </BaseDialog>
</template>
