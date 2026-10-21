<script setup lang="ts">
// A labelled settings row: label + optional hint on the left, the control in
// the default slot on the right.
defineProps<{ label: string; hint?: string }>();
</script>

<template>
  <div class="settings-row">
    <div class="settings-row-text">
      <span class="settings-row-label">{{ label }}</span>
      <span v-if="hint" class="settings-row-hint muted">{{ hint }}</span>
    </div>
    <div class="settings-row-control">
      <slot />
    </div>
  </div>
</template>
