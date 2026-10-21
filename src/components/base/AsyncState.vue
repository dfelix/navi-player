<script setup lang="ts">
// The same loading, error and empty states for every query.
import AppIcon from "./AppIcon.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

defineProps<{
  loading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyMessage?: string;
}>();
</script>

<template>
  <div v-if="loading" class="center-state" role="status" :aria-label="t('common.loading')">
    <span class="spinner" />
  </div>
  <div v-else-if="error" class="center-state" role="alert">
    <AppIcon name="close" :size="28" />
    <p>{{ error instanceof Error ? error.message : t("common.somethingWentWrong") }}</p>
  </div>
  <div v-else-if="isEmpty" class="center-state">
    <AppIcon name="disc" :size="28" />
    <p>{{ emptyMessage ?? t("common.nothingHereYet") }}</p>
  </div>
  <slot v-else />
</template>
