<script setup lang="ts">
// An accessible on/off switch (role="switch").
defineProps<{ label: string }>();
const checked = defineModel<boolean>({ required: true });
</script>

<template>
  <button
    type="button"
    class="toggle"
    :class="{ 'toggle-on': checked }"
    role="switch"
    :aria-checked="checked"
    :aria-label="label"
    @click="checked = !checked"
  >
    <span class="toggle-knob" />
  </button>
</template>
