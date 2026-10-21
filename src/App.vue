<script setup lang="ts">
// The root: a spinner while the server settings and any saved sign-in are
// checked, then either the sign-in screen or the app.
import { computed, watchEffect } from "vue";
import { storedUsername } from "@/api/credentials";
import ErrorBoundary from "@/components/base/ErrorBoundary.vue";
import LoginScreen from "@/components/auth/LoginScreen.vue";
import AppShell from "@/components/layout/AppShell.vue";
import { useArtCacheBudget } from "@/composables/useArtCacheBudget";
import { useMediaSession } from "@/composables/useMediaSession";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";

const session = useSessionStore();
const settings = useSettingsStore();

useMediaSession();
useArtCacheBudget();

// Row height, gutter and inset for each density setting, in px.
const SPACING: Record<string, [number, number, number]> = {
  compact: [36, 8, 10],
  comfortable: [44, 14, 16],
  spacious: [54, 20, 24],
};

// The density and cover-size settings become root CSS variables and an
// attribute the stylesheets read. (Colours are fixed: styles/global.css.)
watchEffect(() => {
  const root = document.documentElement;
  const [row, gutter, inset] = SPACING[settings.layout.density] ?? SPACING.comfortable!;
  Object.entries({ row, gutter, inset }).forEach(([name, px]) =>
    root.style.setProperty(`--${name}`, `${px}px`),
  );
  root.dataset.cover = settings.layout.coverArtSize;
});

const prefillUser = computed(
  () => (session.reauthRequired ? session.username : storedUsername()) ?? undefined,
);
</script>

<template>
  <ErrorBoundary fatal>
    <div v-if="!session.ready" class="app-splash" role="status" aria-label="Loading">
      <span class="spinner" />
    </div>
    <AppShell v-else-if="session.isAuthenticated" />
    <LoginScreen v-else :reauth="session.reauthRequired" :prefill-user="prefillUser" />
  </ErrorBoundary>
</template>
