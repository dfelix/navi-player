<script setup lang="ts">
// Artist tile: round art, name, album count. Plays the artist's full
// discography on the play affordance.
import { computed } from "vue";
import type { ArtistSummary } from "@/api/types";
import AppIcon from "@/components/base/AppIcon.vue";
import CoverArt from "@/components/base/CoverArt.vue";
import RowContextMenu from "@/components/base/RowContextMenu.vue";
import type { ActionItem } from "@/components/base/menu";
import { formatCount } from "@/lib/format";
import { playArtist, playArtistRadio } from "@/services/playback";
import "./cards.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{ artist: ArtistSummary }>();

const actions = computed<ActionItem[]>(() => [
  { label: t("common.play"), icon: "play", onSelect: () => void playArtist(props.artist.id) },
  {
    label: t("player.shuffle"),
    icon: "shuffle",
    onSelect: () => void playArtist(props.artist.id, true),
  },
  {
    label: t("artist.radio"),
    icon: "radio",
    onSelect: () => void playArtistRadio(props.artist),
  },
]);
</script>

<template>
  <RowContextMenu :items="actions">
    <RouterLink :to="`/artist/${artist.id}`" class="card card-artist">
      <div class="card-art">
        <CoverArt :cover-art="artist.coverArt" rounded :req-size="448" alt="" />
        <button
          class="card-play"
          :aria-label="t('common.playItem', { name: artist.name })"
          @click.prevent="playArtist(artist.id)"
        >
          <AppIcon name="play" :size="20" />
        </button>
      </div>
      <div class="card-meta card-meta-center">
        <span class="card-title">{{ artist.name }}</span>
        <span class="card-sub muted">{{ formatCount(artist.albumCount ?? 0, "album") }}</span>
      </div>
    </RouterLink>
  </RowContextMenu>
</template>
