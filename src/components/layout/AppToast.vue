<script setup lang="ts">
// The app-wide status toast (link copied, added to playlist…). Mounted once in
// the shell; anything can raise it with useUiStore().showToast().
import AppIcon from "@/components/base/AppIcon.vue";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
</script>

<template>
  <div v-if="ui.toast" class="toast" role="status">
    <AppIcon name="check" :size="16" /> {{ ui.toast }}
  </div>
</template>
