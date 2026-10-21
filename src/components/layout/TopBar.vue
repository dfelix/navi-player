<script setup lang="ts">
// The search box. Typing goes to /search?q=… after a short pause; the search
// shortcut focuses it.
import { ref, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppIcon from "@/components/base/AppIcon.vue";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import "./topbar.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const route = useRoute();
const router = useRouter();
const settings = useSettingsStore();
const ui = useUiStore();
const input = useTemplateRef<HTMLInputElement>("input");

const routeQuery = () => (route.path === "/search" ? String(route.query.q ?? "") : "");
const value = ref(routeQuery());

let debounce: ReturnType<typeof setTimeout> | undefined;
function onInput(): void {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    const q = value.value.trim();
    if (q) {
      void router[route.path === "/search" ? "replace" : "push"](
        `/search?q=${encodeURIComponent(q)}`,
      );
    }
  }, 280);
}

function submit(): void {
  const q = value.value.trim();
  if (q) void router.push(`/search?q=${encodeURIComponent(q)}`);
}

// Focus on shortcut.
watch(
  () => ui.searchFocusTick,
  () => input.value?.focus(),
);

// When the address changes some other way, the box follows.
watch(routeQuery, (q) => {
  if (route.path === "/search" && q !== value.value) value.value = q;
});
</script>

<template>
  <header class="topbar">
    <!-- Mobile-only: open the navigation drawer. Hidden on desktop. -->
    <button
      class="icon-btn topbar-menu"
      :aria-label="t('nav.openMenu')"
      :title="t('nav.menu')"
      @click="ui.drawerOpen = !ui.drawerOpen"
    >
      <AppIcon name="menu" :size="22" />
    </button>
    <div class="topbar-search">
      <AppIcon name="search" :size="18" class="topbar-search-icon" />
      <input
        ref="input"
        v-model="value"
        class="topbar-search-input"
        type="search"
        :aria-label="t('nav.search')"
        :placeholder="`${t('nav.search')}  ·  ${settings.power.shortcuts.focusSearch}`"
        @input="onInput"
        @keydown.enter="submit"
      />
    </div>
  </header>
</template>
