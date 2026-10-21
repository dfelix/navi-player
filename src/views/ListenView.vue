<script setup lang="ts">
// /listen/:artist/:id — the full-screen player as a real URL. Landing here
// (pasted link, refresh, back button) loads the song, starts it, and opens the
// full-screen view. The page itself renders nothing; FullScreenPlayer is the UI.
import { onMounted } from "vue";
import { useRoute } from "vue-router";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";

const route = useRoute();
const player = usePlayerStore();
const session = useSessionStore();
const ui = useUiStore();

onMounted(async () => {
  const id = String(route.params.id ?? "");
  if (id && player.current?.id !== id) {
    try {
      // Browsers may block playing before the page has been clicked; the queue is
      // loaded anyway, and the play button starts it.
      player.playNow([await session.requireClient().getSong(id)]);
    } catch {
      // Unknown id: still open the player on whatever is queued.
    }
  }
  ui.fullScreen = true;
});
</script>

<template>
  <div class="page" aria-hidden="true" />
</template>
