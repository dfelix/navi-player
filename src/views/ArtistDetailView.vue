<script setup lang="ts">
// Artist detail: header with art and bio, play/shuffle the discography, then
// the albums grid and similar artists.
import { useQuery } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppIcon from "@/components/base/AppIcon.vue";
import AsyncState from "@/components/base/AsyncState.vue";
import CoverArt from "@/components/base/CoverArt.vue";
import MenuButton from "@/components/base/MenuButton.vue";
import type { ActionItem } from "@/components/base/menu";
import AlbumCard from "@/components/library/AlbumCard.vue";
import ArtistCard from "@/components/library/ArtistCard.vue";
import { parseBio } from "@/lib/artistBio";
import { formatCount } from "@/lib/format";
import { qk } from "@/lib/query";
import { downloadCollectionOriginal } from "@/services/download";
import { playArtist, playArtistRadio } from "@/services/playback";
import { shareLink } from "@/services/share";
import { useSessionStore } from "@/stores/session";
import { useStarsStore } from "@/stores/stars";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const route = useRoute();
const session = useSessionStore();
const stars = useStarsStore();

const id = computed(() => String(route.params.id));

const {
  data: artist,
  isLoading,
  error,
} = useQuery(() => ({
  queryKey: qk.artist(id.value),
  queryFn: () => session.requireClient().getArtist(id.value),
  enabled: !!session.client,
}));

const { data: info } = useQuery(() => ({
  queryKey: qk.artistInfo(id.value),
  queryFn: () => session.requireClient().getArtistInfo(id.value),
  enabled: !!session.client,
}));

const albums = computed(() =>
  [...(artist.value?.albums ?? [])].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
);
// Plain text only (never rendered as HTML). For a name Last.fm shares between
// several acts, the entry that mentions one of these albums is shown.
const bio = computed(() =>
  parseBio(
    info.value?.biography,
    albums.value.map((album) => album.name),
  ),
);
// Long bios and disambiguation lists start folded.
const bioOpen = ref(false);
const BIO_FOLDED_ENTRIES = 3;
const bioFoldable = computed(() => {
  const b = bio.value;
  if (!b) return false;
  if (b.kind === "several") return b.match !== null || b.entries.length > BIO_FOLDED_ENTRIES;
  return b.paragraphs.join(" ").length > 420;
});
watch(id, () => (bioOpen.value = false));
const similar = computed(() => info.value?.similarArtist?.slice(0, 12) ?? []);
const starred = computed(
  () => !!artist.value && stars.isStarred(artist.value.id, artist.value.starred),
);

// Building a station takes a few lookups, so the button shows it's working.
const startingRadio = ref(false);
async function startRadio(): Promise<void> {
  const a = artist.value;
  if (!a || startingRadio.value) return;
  startingRadio.value = true;
  try {
    await playArtistRadio(a);
  } finally {
    startingRadio.value = false;
  }
}

const actions = computed<ActionItem[]>(() => {
  const a = artist.value;
  if (!a) return [];
  return [
    {
      label: t("artist.radio"),
      icon: "radio",
      onSelect: () => void startRadio(),
    },
    {
      label: t("common.share"),
      icon: "share",
      onSelect: () => void shareLink(`/artist/${a.id}`, a.name),
    },
    {
      label: t("artist.downloadAll"),
      icon: "download",
      onSelect: () => downloadCollectionOriginal(a.id),
      separatorBefore: true,
    },
  ];
});
</script>

<template>
  <div class="page">
    <AsyncState :loading="isLoading" :error="error">
      <template v-if="artist">
        <header class="detail-head">
          <div class="detail-art artist-art">
            <CoverArt :cover-art="artist.coverArt" rounded :alt="artist.name" />
          </div>
          <div class="detail-info">
            <span class="detail-kind">{{ t("palette.artist") }}</span>
            <h1 class="detail-title">{{ artist.name }}</h1>
            <div class="detail-sub">
              <span>{{ formatCount(albums.length, "album") }}</span>
            </div>
          </div>
        </header>

        <div class="detail-actions">
          <button class="play-big" @click="playArtist(artist.id)">
            <AppIcon name="play" :size="20" class="play-big-icon" /> {{ t("common.play") }}
          </button>
          <button class="btn" @click="playArtist(artist.id, true)">
            <AppIcon name="shuffle" :size="17" /> {{ t("player.shuffle") }}
          </button>
          <button
            class="btn"
            :disabled="startingRadio"
            :aria-busy="startingRadio"
            :aria-label="t('artist.radio')"
            @click="startRadio"
          >
            <span v-if="startingRadio" class="spinner spinner-sm" aria-hidden="true" />
            <AppIcon v-else name="radio" :size="17" />
            {{ t("artist.radioButton") }}
          </button>
          <button
            class="icon-btn"
            :class="{ active: starred }"
            :aria-label="starred ? t('artist.unfavourite') : t('artist.favourite')"
            :aria-pressed="starred"
            @click="stars.toggle(artist.id, artist.starred, 'artist')"
          >
            <AppIcon :name="starred ? 'heart-filled' : 'heart'" :size="22" />
          </button>
          <MenuButton :items="actions" />
        </div>

        <div
          v-if="bio"
          class="bio"
          :class="{ clamped: bio.kind === 'single' && bioFoldable && !bioOpen }"
        >
          <template v-if="bio.kind === 'single'">
            <p v-for="(paragraph, i) in bio.paragraphs" :key="i">{{ paragraph }}</p>
          </template>
          <p v-else-if="bio.match !== null && !bioOpen">{{ bio.entries[bio.match] }}</p>
          <template v-else>
            <p v-if="bio.intro" class="bio-intro">{{ bio.intro }}</p>
            <ol class="bio-entries">
              <li
                v-for="(entry, i) in bioOpen
                  ? bio.entries
                  : bio.entries.slice(0, BIO_FOLDED_ENTRIES)"
                :key="i"
                :class="{ 'bio-match': i === bio.match }"
              >
                {{ entry }}
              </li>
            </ol>
          </template>
          <button
            v-if="bioFoldable"
            class="bio-toggle"
            :aria-expanded="bioOpen"
            @click="bioOpen = !bioOpen"
          >
            {{
              bioOpen
                ? t("artist.bioLess")
                : bio.kind === "several"
                  ? t("artist.bioOthers", { n: bio.entries.length })
                  : t("artist.bioMore")
            }}
          </button>
        </div>

        <h2 class="section-title">{{ t("nav.albums") }}</h2>
        <div class="grid">
          <AlbumCard v-for="album in albums" :key="album.id" :album="album" />
        </div>

        <template v-if="similar.length > 0">
          <h2 class="section-title similar-title">{{ t("artist.similar") }}</h2>
          <div class="grid">
            <ArtistCard v-for="a in similar" :key="a.id" :artist="a" />
          </div>
        </template>
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.artist-art {
  width: 200px;
}
.similar-title {
  margin-top: 34px;
}
</style>
