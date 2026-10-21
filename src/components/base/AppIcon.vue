<script setup lang="ts">
import { computed } from "vue";
import { FILLED_ICONS, ICONS, type IconName } from "./icons";

const props = withDefaults(
  defineProps<{
    name: IconName;
    size?: number;
    strokeWidth?: number;
  }>(),
  { size: 20, strokeWidth: 1.8 },
);

const filled = computed(() => FILLED_ICONS.has(props.name));
</script>

<template>
  <component
    :is="ICONS[name]"
    :size="size"
    :stroke-width="strokeWidth"
    :fill="filled ? 'currentColor' : 'none'"
    :stroke="filled ? 'none' : 'currentColor'"
    aria-hidden="true"
  />
</template>
