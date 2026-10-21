<script setup lang="ts">
// Playlist detail: play, reorder (drag), remove tracks, rename, change
// visibility, set a cover, and delete — all persisted to the server so changes
// sync to other clients.
import { useQuery } from "@tanstack/vue-query";
import { computed, ref, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Song } from "@/api/types";
import AppIcon from "@/components/base/AppIcon.vue";
import AsyncState from "@/components/base/AsyncState.vue";
import CoverArt from "@/components/base/CoverArt.vue";
import MenuButton from "@/components/base/MenuButton.vue";
import type { ActionItem } from "@/components/base/menu";
import SelectionBar from "@/components/library/SelectionBar.vue";
import TrackRow from "@/components/library/TrackRow.vue";
import { formatCount, formatLongDuration } from "@/lib/format";
import { qk, queryClient } from "@/lib/query";
import { shuffled } from "@/lib/shuffle";
import { shareLink } from "@/services/share";
import { usePlayerStore } from "@/stores/player";
import { useSelectionStore } from "@/stores/selection";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";
import "./playlist.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const player = usePlayerStore();
const selection = useSelectionStore();
const ui = useUiStore();
const coverInput = useTemplateRef<HTMLInputElement>("coverInput");

const id = computed(() => String(route.params.id));
const listId = computed(() => `playlist:${id.value}`);

const {
  data: playlist,
  isLoading,
  error,
} = useQuery(() => ({
  queryKey: qk.playlist(id.value),
  queryFn: () => session.requireClient().getPlaylist(id.value),
  enabled: !!session.client,
}));

// Local working copy of the order for instant drag feedback.
const order = ref<Song[]>([]);
const saving = ref(false);
const editing = ref(false);
const name = ref("");
const dragIndex = ref<number | null>(null);
const overIndex = ref<number | null>(null);
const coverBusy = ref(false);

watch(
  playlist,
  (pl) => {
    if (!pl) return;
    order.value = pl.entry;
    name.value = pl.name;
  },
  { immediate: true },
);

// Playlist covers go through Navidrome's native API, which needs a native
// login (a Subsonic-token session has no JWT).
const canEditCover = computed(() => !!session.client?.hasNativeSession);

// Only owners can change a playlist.
// Yours (or ownerless): only then can it be renamed, reordered or shared out.
const ownsCurrent = computed(() => {
  const owner = playlist.value?.owner;
  return !owner || [undefined, owner].includes(session.client?.username);
});

const isCurrentPlaylist = computed(() => order.value.some((s) => s.id === player.current?.id));
const playingThis = computed(() => player.state.isPlaying && isCurrentPlaylist.value);

function invalidate(): void {
  void queryClient.invalidateQueries({ queryKey: qk.playlist(id.value) });
  void queryClient.invalidateQueries({ queryKey: qk.playlists() });
}

async function onPickCover(event: Event): Promise<void> {
  const picker = event.target as HTMLInputElement;
  const [file] = picker.files ?? [];
  picker.value = ""; // so picking the same image again still counts
  if (!file) return;
  coverBusy.value = true;
  try {
    await session.requireClient().uploadPlaylistImage(id.value, file);
    // Fetch it again: the new cover has a new art id, wherever it's shown.
    invalidate();
  } catch (err) {
    alert(err instanceof Error ? err.message : t("playlist.coverFailed"));
  } finally {
    coverBusy.value = false;
  }
}

async function persistOrder(next: Song[]): Promise<void> {
  saving.value = true;
  order.value = next;
  try {
    // Subsonic can't move one entry, so the whole list is written in its new order.
    await session.requireClient().overwritePlaylist(
      id.value,
      next.map((s) => s.id),
      playlist.value?.entry.length ?? next.length,
    );
    void queryClient.invalidateQueries({ queryKey: qk.playlist(id.value) });
  } finally {
    saving.value = false;
  }
}

function onDrop(target: number): void {
  const from = dragIndex.value;
  dragIndex.value = overIndex.value = null;
  const moving = from === null ? undefined : order.value[from];
  if (!moving || from === target) return;
  const without = order.value.filter((_, i) => i !== from);
  void persistOrder([...without.slice(0, target), moving, ...without.slice(target)]);
}

async function removeAt(index: number): Promise<void> {
  saving.value = true;
  order.value = order.value.filter((_, i) => i !== index);
  try {
    await session.requireClient().updatePlaylist(id.value, { songIndexToRemove: [index] });
    invalidate();
  } finally {
    saving.value = false;
  }
}

async function rename(): Promise<void> {
  const newName = name.value.trim();
  if (!newName) return;
  await session.requireClient().updatePlaylist(id.value, { name: newName });
  editing.value = false;
  invalidate();
}

// Flip between private (owner-only) and public (visible to everyone on the
// server). Confirm before exposing it.
async function toggleVisibility(): Promise<void> {
  const pl = playlist.value;
  if (!pl || !ownsCurrent.value) return;
  const goingPublic = !pl.public;
  // Making it public shows it to everyone on the server: ask first.
  if (goingPublic && !confirm(t("playlist.makePublicConfirm"))) return;
  saving.value = true;
  try {
    await session.requireClient().setPlaylistVisibility(id.value, goingPublic);
    invalidate();
  } finally {
    saving.value = false;
  }
}

async function deletePlaylist(): Promise<void> {
  if (!confirm(t("playlist.deleteConfirm", { name: playlist.value?.name ?? "" }))) return;
  await session.requireClient().deletePlaylist(id.value);
  void queryClient.invalidateQueries({ queryKey: qk.playlists() });
  void router.push("/");
}

function playOrPause(): void {
  if (isCurrentPlaylist.value) player.togglePlay();
  else player.playNow(order.value, 0);
}

const visibilityTitle = computed(() => {
  const pl = playlist.value;
  if (!pl) return "";
  if (!ownsCurrent.value) return t("playlist.ownedBy", { owner: pl.owner ?? "" });
  return pl.public ? t("playlist.publicHint") : t("playlist.privateHint");
});

const actions = computed<ActionItem[]>(() => {
  const pl = playlist.value;
  if (!pl) return [];
  const menu: (ActionItem | false)[] = [
    {
      label: t("common.addToQueue"),
      icon: "queue",
      onSelect: () => player.addToQueue(order.value),
    },
    {
      label: t("common.share"),
      icon: "share",
      separatorBefore: true,
      onSelect: () => void shareLink(`/playlist/${pl.id}`, pl.name),
    },
    {
      label: t("common.download"),
      icon: "download",
      onSelect: () =>
        ui.openDownload({ kind: "playlist", id: pl.id, name: pl.name, songs: order.value }),
    },
    canEditCover.value && {
      label: t("playlist.uploadCover"),
      icon: "upload",
      separatorBefore: true,
      onSelect: () => coverInput.value?.click(),
    },
    {
      label: t("playlist.rename"),
      icon: "edit",
      separatorBefore: true,
      onSelect: () => void (editing.value = true),
    },
    {
      label: t("playlist.delete"),
      icon: "trash",
      danger: true,
      onSelect: () => void deletePlaylist(),
    },
  ];
  return menu.filter((item): item is ActionItem => item !== false);
});
</script>

<template>
  <div class="page">
    <AsyncState :loading="isLoading" :error="error">
      <template v-if="playlist">
        <header class="detail-head">
          <div class="detail-art pl-art">
            <CoverArt :cover-art="playlist.coverArt ?? order[0]?.coverArt" :alt="playlist.name" />
            <template v-if="canEditCover">
              <button
                class="pl-art-edit"
                :title="t('playlist.uploadCoverHint')"
                :disabled="coverBusy"
                @click="coverInput?.click()"
              >
                <span v-if="coverBusy" class="spinner small-spinner" />
                <template v-else>
                  <AppIcon name="upload" :size="16" />
                  <span>{{ t("playlist.coverPhoto") }}</span>
                </template>
              </button>
              <input
                ref="coverInput"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                hidden
                @change="onPickCover"
              />
            </template>
          </div>
          <div class="detail-info">
            <span class="detail-kind">{{ t("playlist.kind") }}</span>
            <form v-if="editing" class="pl-rename" @submit.prevent="rename">
              <input v-model="name" class="input" :aria-label="t('nav.playlistName')" autofocus />
              <button class="btn btn-primary" type="submit">{{ t("common.save") }}</button>
              <button class="btn" type="button" @click="editing = false">
                {{ t("common.cancel") }}
              </button>
            </form>
            <h1 v-else class="detail-title">{{ playlist.name }}</h1>
            <p v-if="playlist.comment" class="muted">{{ playlist.comment }}</p>
            <div class="detail-sub">
              <button
                class="pl-visibility"
                :class="{ 'pl-visibility-on': playlist.public }"
                :disabled="!ownsCurrent"
                :title="visibilityTitle"
                @click="toggleVisibility"
              >
                <AppIcon :name="playlist.public ? 'globe' : 'lock'" :size="12" />
                {{ playlist.public ? t("playlist.public") : t("playlist.private") }}
              </button>
              <span class="detail-dot">{{ formatCount(order.length, "track") }}</span>
              <span class="detail-dot">{{ formatLongDuration(playlist.duration) }}</span>
              <span v-if="saving" class="detail-dot pl-saving">
                <span class="spinner tiny-spinner" /> {{ t("common.saving") }}
              </span>
            </div>
          </div>
        </header>

        <div class="detail-actions">
          <button class="play-big" :disabled="order.length === 0" @click="playOrPause">
            <AppIcon :name="playingThis ? 'pause' : 'play'" :size="20" class="play-big-icon" />
            {{ playingThis ? t("common.pause") : t("common.play") }}
          </button>
          <button
            class="btn"
            :disabled="order.length === 0"
            @click="player.playNow(shuffled(order), 0)"
          >
            <AppIcon name="shuffle" :size="17" /> {{ t("player.shuffle") }}
          </button>
          <MenuButton :items="actions" />
        </div>

        <div v-if="order.length === 0" class="center-state">
          <AppIcon name="list" :size="28" />
          <p>{{ t("playlist.empty") }}</p>
        </div>
        <template v-else>
          <div class="tracklist-head">
            <span class="tracklist-head-num">#</span>
            <span class="tracklist-head-title">{{ t("track.title") }}</span>
            <span class="tracklist-head-album">{{ t("track.album") }}</span>
            <span class="tracklist-head-dur">{{ t("track.time") }}</span>
            <span class="tracklist-head-spacer" />
          </div>
          <div
            v-for="(song, i) in order"
            :key="`${song.id}-${i}`"
            class="pl-row"
            :class="{ 'pl-row-over': overIndex === i }"
            draggable="true"
            @dragstart="dragIndex = i"
            @dragover.prevent="overIndex = i"
            @dragend="
              dragIndex = null;
              overIndex = null;
            "
            @drop.prevent="onDrop(i)"
          >
            <span class="pl-grip" aria-hidden="true">
              <AppIcon name="grip" :size="15" />
            </span>
            <div class="pl-row-track">
              <TrackRow
                :song="song"
                :number="i + 1"
                :context="order"
                :context-index="i"
                show-album
                removable
                :selected="selection.isSelected(listId, song.id)"
                @remove="removeAt(i)"
                @row-click="selection.handleRowClick(listId, i, order, $event)"
              />
            </div>
          </div>
        </template>
        <SelectionBar :list-id="listId" :songs="order" />
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.small-spinner {
  width: 16px;
  height: 16px;
}
.tiny-spinner {
  width: 12px;
  height: 12px;
}
</style>
