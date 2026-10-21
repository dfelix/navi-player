<script setup lang="ts">
// Keyboard shortcut reference, opened with "?".
import AppIcon from "@/components/base/AppIcon.vue";
import BaseDialog from "@/components/base/BaseDialog.vue";
import type { ShortcutAction } from "@/lib/settingsSchema";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import "./shortcutsHelp.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const GROUPS: {
  title: `shortcuts.group${"Playback" | "Volume" | "Application"}`;
  actions: ShortcutAction[];
}[] = [
  {
    title: "shortcuts.groupPlayback",
    actions: [
      "playPause",
      "next",
      "previous",
      "seekForward",
      "seekBackward",
      "toggleShuffle",
      "toggleRepeat",
      "starCurrent",
    ],
  },
  { title: "shortcuts.groupVolume", actions: ["volumeUp", "volumeDown", "toggleMute"] },
  { title: "shortcuts.groupApplication", actions: ["focusSearch", "toggleQueue", "toggleLyrics"] },
];

const settings = useSettingsStore();
const ui = useUiStore();
</script>

<template>
  <BaseDialog
    v-model:open="ui.shortcutsHelpOpen"
    :title="t('shortcuts.title')"
    content-class="sh-dialog"
  >
    <template #title>
      <span class="sh-title">
        <AppIcon name="keyboard" :size="20" class="sh-title-icon" /> {{ t("shortcuts.title") }}
      </span>
    </template>

    <div class="sh-body">
      <div v-for="group in GROUPS" :key="group.title" class="sh-group">
        <h3 class="sh-group-title">{{ t(group.title) }}</h3>
        <div class="sh-list">
          <div v-for="action in group.actions" :key="action" class="sh-item">
            <span class="sh-label">{{ t(`shortcuts.action.${action}`) }}</span>
            <kbd class="sh-kbd">{{ settings.power.shortcuts[action] || t("shortcuts.none") }}</kbd>
          </div>
        </div>
      </div>
    </div>

    <div class="sh-footer muted">
      <i18n-t keypath="shortcuts.dismiss" tag="span"
        ><template #key><kbd class="sh-kbd">?</kbd></template></i18n-t
      >
    </div>
  </BaseDialog>
</template>
