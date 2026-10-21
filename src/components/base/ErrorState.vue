<script setup lang="ts">
// Recovery UI for a crashed render. Used by ErrorBoundary: one inside the shell,
// so a failing page leaves the music playing, and one at the root as a last
// resort.
import { computed } from "vue";
import { APP_NAME } from "@/lib/branding";
import AppIcon from "./AppIcon.vue";
import "./errorstate.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{
  error: unknown;
  // When the whole app failed there is no "keep listening": the player went too.
  fatal?: boolean;
}>();

const emit = defineEmits<{ reset: [] }>();

const message = computed(() => {
  const e = props.error;
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : String(e);
});

function reload(): void {
  location.reload();
}
</script>

<template>
  <div class="error-state" role="alert">
    <div class="error-state-inner">
      <AppIcon name="close" :size="26" />
      <h2>{{ fatal ? t("error.fatalTitle", { app: APP_NAME }) : t("error.pageTitle") }}</h2>
      <p class="muted">
        {{ fatal ? t("error.fatalBody") : t("error.pageBody") }}
      </p>
      <pre class="error-state-detail">{{ message }}</pre>
      <div class="error-state-actions">
        <button class="btn btn-primary" @click="emit('reset')">{{ t("error.tryAgain") }}</button>
        <a v-if="!fatal" class="btn" href="/">{{ t("error.goHome") }}</a>
        <button class="btn" @click="reload">{{ t("error.reload") }}</button>
      </div>
    </div>
  </div>
</template>
