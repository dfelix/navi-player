<script setup lang="ts">
// One track in a list, the component the app shows most. Double-click or the
// play button plays it in the context of its list; the menu (right-click or
// "…") has everything else; the heart favourites it.
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import type { Song } from "@/api/types";
import AppIcon from "@/components/base/AppIcon.vue";
import CoverArt from "@/components/base/CoverArt.vue";
import MenuButton from "@/components/base/MenuButton.vue";
import RowContextMenu from "@/components/base/RowContextMenu.vue";
import type { ActionItem } from "@/components/base/menu";
import { SONGS_MIME } from "@/lib/dragSongs";
import { formatDuration, formatRelativeDate } from "@/lib/format";
import { playArtistRadio } from "@/services/playback";
import { shareLink } from "@/services/share";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { useStarsStore } from "@/stores/stars";
import { useUiStore } from "@/stores/ui";
import "./trackrow.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{
  song: Song;
  number?: number; // shown at the left: track number or position
  // The whole list and this track's place in it, so playing it queues the rest.
  context?: Song[];
  contextIndex?: number;
  showCover?: boolean;
  showAlbum?: boolean;
  removable?: boolean; // in a playlist you can edit: offers "Remove from playlist"
  highlighted?: boolean; // opened from a shared link: pulses briefly
  selected?: boolean;
  // The track ids a drag onto a sidebar playlist carries. Without it the row
  // isn't draggable: the playlist page drags rows to reorder them, and a
  // draggable row would take that drag over.
  dragSongIds?: () => string[];
}>();

const emit = defineEmits<{
  rowClick: [event: MouseEvent];
  remove: [];
}>();

const router = useRouter();
const player = usePlayerStore();
const settings = useSettingsStore();
const stars = useStarsStore();
const ui = useUiStore();

const starred = computed(() => stars.isStarred(props.song.id, props.song.starred));
const isCurrent = computed(() => player.current?.id === props.song.id);
const isPlayingThis = computed(() => isCurrent.value && player.state.isPlaying);
const pop = ref(false);

// The heart gives a little bounce when it's filled.
function star(): void {
  const filling = !starred.value;
  void stars.toggle(props.song.id, props.song.starred, "song");
  if (!filling) return;
  pop.value = true;
  setTimeout(() => (pop.value = false), 360);
}

function play(): void {
  const { context, contextIndex, song } = props;
  if (isCurrent.value) player.togglePlay();
  else if (context && contextIndex !== undefined) player.playNow(context, contextIndex);
  else player.playNow([song], 0);
}

function onDragStart(event: DragEvent): void {
  const ids = props.dragSongIds?.() ?? [];
  if (!event.dataTransfer || ids.length === 0) return;
  event.dataTransfer.setData(SONGS_MIME, JSON.stringify(ids));
  event.dataTransfer.effectAllowed = "copy";
}

const actions = computed<ActionItem[]>(() => {
  const song = props.song;
  const playing = isPlayingThis.value;
  const goTo = (path: string) => () => void router.push(path);
  const shareTitle = song.artist ? `${song.title} — ${song.artist}` : song.title;

  const menu: (ActionItem | false)[] = [
    {
      label: t(playing ? "common.pause" : "common.play"),
      icon: playing ? "pause" : "play",
      onSelect: play,
    },
    { label: t("common.playNext"), icon: "next", onSelect: () => player.playNext([song]) },
    { label: t("common.addToQueue"), icon: "queue", onSelect: () => player.addToQueue([song]) },
    {
      label: t("common.addToPlaylist"),
      icon: "plus",
      separatorBefore: true,
      onSelect: () => ui.openAddToPlaylist([song.id]),
    },
    {
      label: t(starred.value ? "common.removeFavourite" : "common.favourite"),
      icon: starred.value ? "heart-filled" : "heart",
      onSelect: () => void stars.toggle(song.id, song.starred, "song"),
    },
    {
      label: t("common.share"),
      icon: "share",
      separatorBefore: true,
      onSelect: () => void shareLink(`/song/${song.id}`, shareTitle),
    },
    {
      label: t("common.download"),
      icon: "download",
      onSelect: () => ui.openDownload({ kind: "song", song }),
    },
    !!song.albumId && {
      label: t("common.goToAlbum"),
      icon: "disc",
      separatorBefore: true,
      onSelect: goTo(`/album/${song.albumId}`),
    },
    !!song.artistId && {
      label: t("common.goToArtist"),
      icon: "mic",
      onSelect: goTo(`/artist/${song.artistId}`),
    },
    !!(song.artistId && song.artist) && {
      label: t("common.goToArtistRadio"),
      icon: "radio",
      onSelect: () => void playArtistRadio({ id: song.artistId!, name: song.artist! }),
    },
    !!props.removable && {
      label: t("common.removeFromPlaylist"),
      icon: "trash",
      danger: true,
      separatorBefore: true,
      onSelect: () => emit("remove"),
    },
  ];
  return menu.filter((item): item is ActionItem => item !== false);
});
</script>

<template>
  <RowContextMenu :items="actions">
    <div
      class="track-row"
      :class="{
        'track-row-current': isCurrent,
        'track-row-highlight': highlighted,
        'track-row-selected': selected,
      }"
      :data-song-id="song.id"
      :draggable="!!dragSongIds"
      @dragstart="onDragStart"
      @click="emit('rowClick', $event)"
      @dblclick="play"
    >
      <div class="track-index">
        <span v-if="isPlayingThis" class="track-playing"><i /><i /><i /></span>
        <span v-else class="track-num">{{ number ?? "" }}</span>
        <button
          class="track-play-overlay"
          :aria-label="
            isPlayingThis
              ? t('common.pauseItem', { name: song.title })
              : t('common.playItem', { name: song.title })
          "
          @click="play"
        >
          <AppIcon :name="isPlayingThis ? 'pause' : 'play'" :size="15" />
        </button>
      </div>

      <CoverArt v-if="showCover" :cover-art="song.coverArt" :size="38" class="track-cover" alt="" />

      <div class="track-main">
        <span class="track-title" :class="{ 'accent-text': isCurrent }">{{ song.title }}</span>
        <span class="track-artist muted">{{ song.artist }}</span>
      </div>

      <span v-if="showAlbum" class="track-album muted">{{ song.album }}</span>

      <span
        v-if="settings.layout.showPlayCounts"
        class="track-plays muted"
        :title="
          song.played ? t('track.lastPlayed', { date: formatRelativeDate(song.played) }) : undefined
        "
      >
        <template v-if="(song.playCount ?? 0) > 0">
          {{ song.playCount }}&nbsp;<AppIcon name="play" :size="11" />
        </template>
      </span>

      <button
        class="icon-btn track-star"
        :class="{ 'track-star-on': starred, 'heart-pop': pop }"
        :aria-label="starred ? t('common.removeFavourite') : t('common.favourite')"
        @click.stop="star"
      >
        <AppIcon :name="starred ? 'heart-filled' : 'heart'" :size="16" />
      </button>

      <span class="track-duration muted">{{ formatDuration(song.duration) }}</span>

      <MenuButton :items="actions" class="track-more" />
    </div>
  </RowContextMenu>
</template>
