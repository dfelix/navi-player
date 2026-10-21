<script setup lang="ts">
// Catches render/lifecycle errors from its children and shows a recovery
// screen instead of letting them unmount the whole app.
import { onErrorCaptured, ref } from "vue";
import ErrorState from "./ErrorState.vue";

defineProps<{ fatal?: boolean }>();

const error = ref<unknown>(null);
// Bumped on reset so the children re-mount from scratch.
const generation = ref(0);

onErrorCaptured((err) => {
  error.value = err;
  console.error(err);
  return false; // handled here; don't propagate further
});

function reset(): void {
  error.value = null;
  generation.value++;
}
</script>

<template>
  <ErrorState v-if="error" :error="error" :fatal="fatal" @reset="reset" />
  <!-- display: contents keeps the wrapper out of layout; the key remounts the
       children from scratch after a reset. -->
  <div v-else :key="generation" class="error-boundary">
    <slot />
  </div>
</template>

<style scoped>
.error-boundary {
  display: contents;
}
</style>
