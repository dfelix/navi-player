<script setup lang="ts">
// Developer tool: the app's recent log messages, so they can be read (and
// copied into a bug report) without opening the browser's developer tools.
// Messages come from the in-memory history in lib/log, already masked.
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import SelectField from "@/components/settings/SelectField.vue";
import { clearLogHistory, logHistory, type LogEntry } from "@/lib/log";
import "./debug-panel.css";

const { t, locale } = useI18n();

const scope = ref("");
const copied = ref(false);

const scopes = computed(() => [
  { value: "", label: t("settings.developer.logScopeAll") },
  ...[...new Set(logHistory.value.map((e) => e.scope))].sort().map((s) => ({ value: s, label: s })),
]);

// Newest first: what you're looking for is usually what just happened.
const entries = computed(() =>
  logHistory.value.filter((e) => !scope.value || e.scope === scope.value).toReversed(),
);

function time(entry: LogEntry): string {
  return new Date(entry.time).toLocaleTimeString(locale.value, { hour12: false });
}

function line(entry: LogEntry): string {
  return `${new Date(entry.time).toISOString()} ${entry.level.toUpperCase()} [${entry.scope}] ${entry.text}`;
}

async function copy(): Promise<void> {
  // Oldest first in the copy, the way a log file reads.
  await navigator.clipboard.writeText(entries.value.toReversed().map(line).join("\n"));
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
  <div class="debug-panel log-viewer">
    <div class="log-toolbar">
      <SelectField v-model="scope" :options="scopes" :label="t('settings.developer.logScope')" />
      <span class="muted log-count">{{ t("settings.developer.logCount", entries.length) }}</span>
      <button class="btn debug-ep" :disabled="entries.length === 0" @click="copy">
        {{ copied ? t("settings.developer.logCopied") : t("settings.developer.logCopy") }}
      </button>
      <button class="btn debug-ep" :disabled="entries.length === 0" @click="clearLogHistory">
        {{ t("settings.developer.logClear") }}
      </button>
    </div>
    <p v-if="entries.length === 0" class="muted log-empty">
      {{ t("settings.developer.logEmpty") }}
    </p>
    <ol v-else class="debug-output log-list">
      <li v-for="e in entries" :key="e.id" :class="['log-entry', `log-${e.level}`]">
        <time class="log-time">{{ time(e) }}</time>
        <span class="log-level">{{ e.level }}</span>
        <span class="log-tag">[{{ e.scope }}]</span>
        <span class="log-text">{{ e.text }}</span>
      </li>
    </ol>
  </div>
</template>
