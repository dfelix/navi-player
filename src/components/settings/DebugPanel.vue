<script setup lang="ts">
// Developer tool (Settings → Advanced): run a few Navidrome API calls and see
// the raw answer. The URL is shown with the token and salt hidden.
import { ref } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import { maskSecrets } from "@/lib/log";
import { useSessionStore } from "@/stores/session";
import "./debug-panel.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

type Params = Record<string, string | number>;

// Button label → [endpoint, parameters].
const CALLS: [label: string, endpoint: string, params?: Params][] = [
  ["ping", "ping.view"],
  ["getArtists", "getArtists.view"],
  ["getAlbumList2 (newest)", "getAlbumList2.view", { type: "newest", size: 5 }],
  ["getGenres", "getGenres.view"],
  ["getPlaylists", "getPlaylists.view"],
  ["getStarred2", "getStarred2.view"],
  ["getScanStatus", "getScanStatus.view"],
];

const session = useSessionStore();
const output = ref("");
const loading = ref(false);
const shownUrl = ref("");

async function call(endpoint: string, params: Params = {}): Promise<void> {
  const client = session.client;
  if (!client) return;
  const url = client.buildUrl(endpoint, params);
  shownUrl.value = maskSecrets(url);
  loading.value = true;
  try {
    output.value = JSON.stringify(await (await fetch(url)).json(), null, 2);
  } catch (err) {
    output.value = t("debug.error", { message: (err as Error)?.message ?? String(err) });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="debug-panel">
    <div class="debug-endpoints">
      <button
        v-for="[label, endpoint, params] in CALLS"
        :key="label"
        class="btn debug-ep"
        @click="call(endpoint, params)"
      >
        {{ label }}
      </button>
    </div>
    <div v-if="shownUrl" class="debug-url">
      <AppIcon name="server" :size="13" />
      <code>{{ shownUrl }}</code>
    </div>
    <div v-if="loading" class="center-state"><span class="spinner" /></div>
    <pre v-else-if="output" class="debug-output">{{ output }}</pre>
  </div>
</template>
