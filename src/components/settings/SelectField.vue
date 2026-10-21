<script setup lang="ts" generic="T extends string">
// A styled <select> bound with v-model.
defineProps<{ options: { value: T; label: string }[]; label?: string }>();
const value = defineModel<T>({ required: true });
</script>

<template>
  <select v-model="value" class="input settings-select" :aria-label="label">
    <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
  </select>
</template>
