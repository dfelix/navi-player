<script setup lang="ts">
// A slider with its current value shown alongside, bound with v-model.
import BaseSlider from "@/components/base/BaseSlider.vue";

withDefaults(
  defineProps<{ min: number; max: number; step?: number; suffix?: string; label: string }>(),
  { step: 1, suffix: "" },
);
const value = defineModel<number>({ required: true });
</script>

<template>
  <div class="settings-range">
    <BaseSlider v-model="value" :min="min" :max="max" :step="step" :label="label" />
    <span class="settings-range-value">{{ value }}{{ suffix }}</span>
  </div>
</template>
