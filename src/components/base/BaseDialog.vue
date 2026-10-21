<script setup lang="ts">
// Modal dialog chrome over Reka UI: focus trap, Escape/overlay to close, and
// aria wiring. Content goes in the default slot.
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import AppIcon from "./AppIcon.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

defineProps<{
  title: string;
  // Extra class on the content box, for per-dialog sizing.
  contentClass?: string;
}>();

const open = defineModel<boolean>("open", { required: true });
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" />
      <!-- The portal renders its children even while closed; this full-screen
           centring layer must only exist while open, or it covers the app and
           swallows every click. -->
      <div v-if="open" class="dialog-positioner">
        <DialogContent class="dialog-content" :class="contentClass" :aria-describedby="undefined">
          <div class="dialog-header">
            <DialogTitle class="dialog-title">
              <slot name="title">{{ title }}</slot>
            </DialogTitle>
            <DialogClose class="icon-btn" :aria-label="t('common.close')">
              <AppIcon name="close" :size="18" />
            </DialogClose>
          </div>
          <slot />
        </DialogContent>
      </div>
    </DialogPortal>
  </DialogRoot>
</template>
