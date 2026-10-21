<script setup lang="ts">
// An album tile. Hovering shows a play button; right-click opens the album's
// menu.
import { computed } from "vue";
import { useRouter } from "vue-router";
import type { Album } from "@/api/types";
import AppIcon from "@/components/base/AppIcon.vue";
import CoverArt from "@/components/base/CoverArt.vue";
import RowContextMenu from "@/components/base/RowContextMenu.vue";
import type { ActionItem } from "@/components/base/menu";
import { playAlbum, queueAlbum } from "@/services/playback";
import { useStarsStore } from "@/stores/stars";
import "./cards.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{ album: Album }>();

const router = useRouter();
const stars = useStarsStore();

const actions = computed<ActionItem[]>(() => {
  const starred = stars.isStarred(props.album.id, props.album.starred);
  return [
    { label: t("common.play"), icon: "play", onSelect: () => void playAlbum(props.album.id) },
    {
      label: t("player.shuffle"),
      icon: "shuffle",
      onSelect: () => void playAlbum(props.album.id, true),
    },
    {
      label: t("common.playNext"),
      icon: "next",
      onSelect: () => void queueAlbum(props.album.id, "next"),
    },
    {
      label: t("common.addToQueue"),
      icon: "queue",
      onSelect: () => void queueAlbum(props.album.id, "end"),
    },
    {
      label: starred ? t("common.removeFavourite") : t("common.favourite"),
      icon: starred ? "heart-filled" : "heart",
      onSelect: () => void stars.toggle(props.album.id, props.album.starred, "album"),
      separatorBefore: true,
    },
    {
      label: t("common.goToArtist"),
      icon: "mic",
      onSelect: () => props.album.artistId && router.push(`/artist/${props.album.artistId}`),
      disabled: !props.album.artistId,
    },
  ];
});
</script>

<template>
  <RowContextMenu :items="actions">
    <RouterLink :to="`/album/${album.id}`" class="card">
      <div class="card-art">
        <CoverArt :cover-art="album.coverArt" :req-size="448" alt="" />
        <button
          class="card-play"
          :aria-label="t('common.playItem', { name: album.name })"
          @click.prevent="playAlbum(album.id)"
        >
          <AppIcon name="play" :size="20" />
        </button>
      </div>
      <div class="card-meta">
        <span class="card-title">{{ album.name }}</span>
        <span v-if="album.artist" class="card-sub muted">{{ album.artist }}</span>
      </div>
    </RouterLink>
  </RowContextMenu>
</template>
