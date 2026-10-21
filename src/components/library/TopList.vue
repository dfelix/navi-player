<script setup lang="ts">
// A numbered "most played" column for the Stats page. Rows either link
// somewhere or run an action (playing a song).
import AppIcon from "@/components/base/AppIcon.vue";
import CoverArt from "@/components/base/CoverArt.vue";
import type { IconName } from "@/components/base/icons";
import type { TopRow } from "./topList";

defineProps<{ icon: IconName; title: string; rows: TopRow[] }>();
</script>

<template>
  <div class="top-list">
    <h3 class="top-list-title">
      <AppIcon :name="icon" :size="15" />
      {{ title }}
    </h3>
    <ol class="top-rows">
      <li v-for="(row, i) in rows" :key="row.key">
        <component
          :is="row.to ? 'RouterLink' : 'button'"
          v-bind="row.to ? { to: row.to } : { type: 'button' }"
          class="top-row"
          @click="row.onClick?.()"
        >
          <span class="top-rank">{{ i + 1 }}</span>
          <CoverArt
            :cover-art="row.coverArt"
            :size="40"
            :req-size="96"
            :rounded="row.round"
            alt=""
          />
          <span class="top-text">
            <span class="top-name">{{ row.title }}</span>
            <span v-if="row.subtitle" class="top-sub muted">{{ row.subtitle }}</span>
          </span>
          <span v-if="row.plays !== undefined" class="top-plays muted">{{
            row.plays.toLocaleString()
          }}</span>
        </component>
      </li>
    </ol>
  </div>
</template>
