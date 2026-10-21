<script setup lang="ts">
// A shared song link (/song/<id>): opens the song's album with the track
// highlighted, or the full-screen player when it has no album.
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppIcon from "@/components/base/AppIcon.vue";
import { slugify } from "@/lib/slug";
import { useSessionStore } from "@/stores/session";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const notFound = ref(false);

onMounted(async () => {
  try {
    const song = await session.requireClient().getSong(String(route.params.id ?? ""));
    await router.replace(
      song.albumId
        ? `/album/${song.albumId}?track=${song.id}`
        : `/listen/${slugify(song.artist)}/${song.id}`,
    );
  } catch {
    notFound.value = true;
  }
});
</script>

<template>
  <div class="page">
    <div v-if="notFound" class="center-state">
      <AppIcon name="close" :size="28" />
      <p>{{ t("songLink.notFound") }}</p>
    </div>
    <div v-else class="center-state" role="status" :aria-label="t('common.loading')">
      <span class="spinner" />
    </div>
  </div>
</template>
