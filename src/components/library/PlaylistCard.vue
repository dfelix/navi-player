<script setup lang="ts">
// A playlist tile, like an album's: its cover, its name, and whose it is (or,
// for your own, how long it is). Hovering shows a play button; right-click
// offers play and shuffle.
import { computed } from "vue";
import type { Playlist } from "@/api/types";
import AppIcon from "@/components/base/AppIcon.vue";
import CoverArt from "@/components/base/CoverArt.vue";
import RowContextMenu from "@/components/base/RowContextMenu.vue";
import type { ActionItem } from "@/components/base/menu";
import { formatCount } from "@/lib/format";
import { ownsPlaylist } from "@/lib/playlists";
import { playPlaylist } from "@/services/playback";
import { useSessionStore } from "@/stores/session";
import "./cards.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{ playlist: Playlist }>();

const session = useSessionStore();
const sub = computed(() =>
  ownsPlaylist(props.playlist, session.client?.username)
    ? formatCount(props.playlist.songCount, "track")
    : props.playlist.owner,
);

const actions = computed<ActionItem[]>(() => [
  { label: t("common.play"), icon: "play", onSelect: () => void playPlaylist(props.playlist.id) },
  {
    label: t("player.shuffle"),
    icon: "shuffle",
    onSelect: () => void playPlaylist(props.playlist.id, true),
  },
]);
</script>

<template>
  <RowContextMenu :items="actions">
    <RouterLink :to="`/playlist/${playlist.id}`" class="card">
      <div class="card-art">
        <CoverArt :cover-art="playlist.coverArt" :req-size="448" alt="" />
        <button
          class="card-play"
          :aria-label="t('common.playItem', { name: playlist.name })"
          @click.prevent="playPlaylist(playlist.id)"
        >
          <AppIcon name="play" :size="20" />
        </button>
      </div>
      <div class="card-meta">
        <span class="card-title">{{ playlist.name }}</span>
        <span v-if="sub" class="card-sub muted">{{ sub }}</span>
      </div>
    </RouterLink>
  </RowContextMenu>
</template>
