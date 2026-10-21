<script setup lang="ts">
// Genre detail: tracks tagged with a genre, with play / shuffle / radio.
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppIcon from "@/components/base/AppIcon.vue";
import AsyncState from "@/components/base/AsyncState.vue";
import SelectionBar from "@/components/library/SelectionBar.vue";
import SongList from "@/components/library/SongList.vue";
import { formatCount } from "@/lib/format";
import { qk } from "@/lib/query";
import { shuffled } from "@/lib/shuffle";
import { playInstantMix } from "@/services/playback";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const route = useRoute();
const session = useSessionStore();
const player = usePlayerStore();

// The router has already decoded the path segment.
const genre = computed(() => String(route.params.name ?? ""));
const listId = computed(() => `genre:${genre.value}`);

const { data, isLoading, error } = useQuery(() => ({
  queryKey: qk.songsByGenre(genre.value),
  queryFn: () => session.requireClient().getSongsByGenre(genre.value, 250),
  enabled: !!session.client,
}));

const songs = computed(() => data.value ?? []);
</script>

<template>
  <div class="page">
    <div class="list-header">
      <div>
        <span class="detail-kind">{{ t("genre.kind") }}</span>
        <h1 class="page-title">{{ genre }}</h1>
      </div>
    </div>
    <AsyncState :loading="isLoading" :error="error" :is-empty="songs.length === 0">
      <div class="detail-actions">
        <button class="play-big" @click="player.playNow(songs, 0)">
          <AppIcon name="play" :size="20" class="play-big-icon" /> {{ t("common.play") }}
        </button>
        <button class="btn" @click="player.playNow(shuffled(songs), 0)">
          <AppIcon name="shuffle" :size="17" /> {{ t("player.shuffle") }}
        </button>
        <button class="btn" @click="playInstantMix(genre, 'genre')">
          <AppIcon name="radio" :size="17" /> {{ t("genre.radio") }}
        </button>
        <span class="muted">{{ formatCount(songs.length, "track") }}</span>
      </div>
      <SongList
        :songs="songs"
        show-cover
        show-album
        show-header
        numbering="index"
        :selection-id="listId"
      />
      <SelectionBar :list-id="listId" :songs="songs" />
    </AsyncState>
  </div>
</template>
