<script setup lang="ts">
// A slider on a native range input, so keyboards and screen readers work
// without extra effort; the accent fill is painted with a CSS variable.
import { computed } from "vue";
import "./slider.css";

const props = withDefaults(
  defineProps<{
    modelValue: number;
    max: number;
    min?: number;
    step?: number;
    // Accessible name (rendered as aria-label).
    label: string;
    disabled?: boolean;
  }>(),
  { min: 0, step: 1, disabled: false },
);

const emit = defineEmits<{
  // Fires continuously while dragging.
  "update:modelValue": [value: number];
  // Fires once on release.
  change: [value: number];
}>();

const fill = computed(() => {
  const range = props.max - props.min;
  return range <= 0 ? 0 : ((props.modelValue - props.min) / range) * 100;
});

function value(e: Event): number {
  return Number((e.target as HTMLInputElement).value);
}
</script>

<template>
  <input
    type="range"
    class="slider"
    :style="{ '--filled': `${fill}%` }"
    :min="min"
    :max="max"
    :step="step"
    :value="modelValue"
    :disabled="disabled"
    :aria-label="label"
    @input="emit('update:modelValue', value($event))"
    @change="emit('change', value($event))"
  />
</template>
