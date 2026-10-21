<script setup lang="ts">
// Changing shortcuts: click a key, then press the new one (Escape cancels).
// Two actions on one key are flagged.
import { ref } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import { DEFAULT_SHORTCUTS, type ShortcutAction } from "@/lib/settingsSchema";
import { keyFromEvent } from "@/lib/shortcutMatching";
import { useSettingsStore } from "@/stores/settings";
import "./shortcuts-editor.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const settings = useSettingsStore();
const recording = ref<ShortcutAction | null>(null);
const actions = Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[];

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

// While a key button is listening: Escape gives up, a modifier alone keeps
// waiting, anything else becomes the new shortcut.
function capture(event: KeyboardEvent, action: ShortcutAction): void {
  if (recording.value !== action) return;
  event.preventDefault();
  event.stopPropagation();
  if (MODIFIER_KEYS.has(event.key)) return;
  if (event.key !== "Escape") settings.power.shortcuts[action] = keyFromEvent(event);
  recording.value = null;
}

// Whether another action uses the same keys.
function hasConflict(action: ShortcutAction): boolean {
  const keys = settings.power.shortcuts;
  return actions.some((other) => other !== action && keys[other] === keys[action]);
}

function resetAll(): void {
  settings.power.shortcuts = { ...DEFAULT_SHORTCUTS };
}
</script>

<template>
  <div class="settings-block">
    <div class="settings-block-head">
      <h3 class="settings-block-title">{{ t("shortcuts.title") }}</h3>
      <button class="btn btn-ghost" @click="resetAll">{{ t("shortcuts.reset") }}</button>
    </div>
    <div class="shortcut-list">
      <div v-for="action in actions" :key="action" class="shortcut-row">
        <span class="shortcut-label">{{ t(`shortcuts.action.${action}`) }}</span>
        <span
          v-if="hasConflict(action)"
          class="shortcut-conflict"
          :title="t('shortcuts.conflictHint')"
        >
          <AppIcon name="close" :size="12" /> {{ t("shortcuts.conflict") }}
        </span>
        <button
          class="shortcut-key"
          :class="{ 'shortcut-key-recording': recording === action }"
          :aria-label="
            t('shortcuts.bindingLabel', {
              action: t(`shortcuts.action.${action}`),
              key: settings.power.shortcuts[action],
            })
          "
          @click="recording = action"
          @keydown="capture($event, action)"
          @blur="recording === action && (recording = null)"
        >
          {{ recording === action ? t("shortcuts.pressKeys") : settings.power.shortcuts[action] }}
        </button>
      </div>
    </div>
  </div>
</template>
