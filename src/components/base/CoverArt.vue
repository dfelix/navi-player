<script setup lang="ts">
// Album and artist pictures. Without one (or while it loads) there's a quiet
// icon on a soft gradient, never a broken image.
import { computed, ref, watch } from "vue";
import { useSessionStore } from "@/stores/session";
import AppIcon from "./AppIcon.vue";
import "./coverart.css";

const props = defineProps<{
  coverArt?: string;
  size?: number;
  // The picture size to ask the server for, separate from the size shown: grids
  // ask for more so covers stay sharp on high-density screens.
  reqSize?: number;
  rounded?: boolean;
  alt?: string;
}>();

const session = useSessionStore();

// Twice the shown size by default, for sharp covers on high-density screens.
const url = computed(() => {
  const art = props.coverArt;
  const pixels = props.reqSize ?? (props.size ? 2 * props.size : 600);
  return (art && session.client?.coverArtUrl(art, pixels)) || "";
});

const loaded = ref(false);
watch(url, () => (loaded.value = false));
</script>

<template>
  <div
    class="cover"
    :class="{ 'cover-round': rounded }"
    :style="size ? { width: `${size}px`, height: `${size}px` } : undefined"
  >
    <img
      v-if="url"
      :src="url"
      :alt="alt ?? ''"
      loading="lazy"
      draggable="false"
      class="cover-img"
      :class="{ 'cover-loaded': loaded }"
      @load="loaded = true"
    />
    <div v-else class="cover-fallback">
      <AppIcon name="disc" :size="size ? Math.max(18, size / 3) : 28" />
    </div>
  </div>
</template>
