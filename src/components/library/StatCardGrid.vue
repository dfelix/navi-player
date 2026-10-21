<script setup lang="ts">
import AppIcon from "@/components/base/AppIcon.vue";
import type { StatCard } from "@/lib/stats";

defineProps<{ cards: StatCard[] }>();
</script>

<template>
  <div class="stats-grid">
    <div v-for="c in cards" :key="c.label" class="stat-card">
      <span class="stat-icon">
        <AppIcon :name="c.icon" :size="22" />
      </span>
      <span class="stat-value">{{ c.value }}</span>
      <span class="stat-label muted">{{ c.label }}</span>
      <span v-if="c.hint" class="stat-hint muted">{{ c.hint }}</span>
    </div>
  </div>
</template>
