<script setup lang="ts">
// Settings — organised into Appearance, Playback, Connection and Advanced so
// depth doesn't overwhelm. Layout, playback behaviour, power-user controls, a
// debug panel, and settings export/import/reset all live here. Colours are not
// configurable: NaviPlayer has one fixed palette.
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import AppIcon from "@/components/base/AppIcon.vue";
import type { IconName } from "@/components/base/icons";
import DebugPanel from "@/components/settings/DebugPanel.vue";
import LogViewer from "@/components/settings/LogViewer.vue";
import EqualizerEditor from "@/components/settings/EqualizerEditor.vue";
import RangeField from "@/components/settings/RangeField.vue";
import SelectField from "@/components/settings/SelectField.vue";
import ServerInfo from "@/components/settings/ServerInfo.vue";
import SettingsRow from "@/components/settings/SettingsRow.vue";
import ShortcutsEditor from "@/components/settings/ShortcutsEditor.vue";
import ToggleSwitch from "@/components/settings/ToggleSwitch.vue";
import { usePwaInstall } from "@/composables/usePwaInstall";
import { LOCALE_NAMES, LOCALES } from "@/i18n";
import type {
  CoverArtSize,
  Density,
  LandingPage,
  LanguageSetting,
  LogLevel,
  ReplayGainMode,
} from "@/lib/settingsSchema";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { saveBlob } from "@/services/browserZip";
import { useSettingsStore } from "@/stores/settings";
import "./settings.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

type Tab = "appearance" | "playback" | "connection" | "advanced";
const TABS: { id: Tab; icon: IconName }[] = [
  { id: "appearance", icon: "list" },
  { id: "playback", icon: "play" },
  { id: "connection", icon: "link" },
  { id: "advanced", icon: "settings" },
];

const DENSITIES = computed<{ value: Density; label: string }[]>(() => [
  { value: "compact", label: t("settings.layout.compact") },
  { value: "comfortable", label: t("settings.layout.comfortable") },
  { value: "spacious", label: t("settings.layout.spacious") },
]);
const COVER_SIZES = computed<{ value: CoverArtSize; label: string }[]>(() => [
  { value: "small", label: t("settings.layout.small") },
  { value: "medium", label: t("settings.layout.medium") },
  { value: "large", label: t("settings.layout.large") },
]);
const LANDINGS = computed<{ value: LandingPage; label: string }[]>(() => [
  { value: "home", label: t("nav.home") },
  { value: "albums", label: t("nav.albums") },
  { value: "artists", label: t("nav.artists") },
  { value: "recently-added", label: t("home.recentlyAdded") },
  { value: "recently-played", label: t("home.recentlyPlayed") },
]);
const REPLAY_GAIN = computed<{ value: ReplayGainMode; label: string }[]>(() => [
  { value: "off", label: t("settings.playback.off") },
  { value: "track", label: t("settings.playback.perTrack") },
  { value: "album", label: t("settings.playback.perAlbum") },
]);
// Streaming quality: the original file, or a cap the server converts down to.
const BITRATES = computed(() => [
  { value: "0", label: t("download.quality.original.label") },
  ...[320, 256, 192, 128].map((kbps) => ({ value: String(kbps), label: `${kbps} kbps` })),
]);
// Not a saved setting: the viewer is something you open while investigating.
const showLogs = ref(false);
const LOG_LEVELS = computed<{ value: LogLevel; label: string }[]>(() => [
  { value: "silent", label: t("settings.developer.silent") },
  { value: "error", label: t("settings.developer.error") },
  { value: "info", label: t("settings.developer.info") },
  { value: "debug", label: t("settings.developer.debug") },
]);
// Language names stay in their own language so anyone can find theirs.
const LANGUAGES = computed<{ value: LanguageSetting; label: string }[]>(() => [
  { value: "auto", label: t("settings.profile.languageAuto") },
  ...LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] })),
]);

const route = useRoute();
const settings = useSettingsStore();
const session = useSessionStore();
const player = usePlayerStore();
const pwa = usePwaInstall();

// Honour deep links like /settings?tab=playback.
const tab = ref<Tab>(
  TABS.some((item) => item.id === route.query.tab) ? (route.query.tab as Tab) : "appearance",
);
const importMsg = ref<{ ok: boolean; text: string } | null>(null);

// Store values in a unit the UI doesn't use are adapted here.
const crossfade = computed({
  get: () => settings.playback.crossfadeSeconds,
  set: (v: number) => {
    settings.playback.crossfadeSeconds = v;
    player.syncCrossfade();
  },
});
const maxBitRate = computed({
  get: () => String(settings.playback.maxBitRate),
  set: (v: string) => (settings.playback.maxBitRate = Number(v)),
});
const libraryStaleMinutes = computed({
  get: () => settings.power.polling.libraryStaleMs / 60000,
  set: (v: number) => (settings.power.polling.libraryStaleMs = v * 60000),
});

function doExport(): void {
  saveBlob(
    new Blob([settings.exportJson()], { type: "application/json" }),
    "navi-player-settings.json",
  );
}

async function doImport(event: Event): Promise<void> {
  const picker = event.target as HTMLInputElement;
  const [file] = picker.files ?? [];
  picker.value = ""; // so choosing the same file again still counts
  if (!file) return;
  const result = settings.importJson(await file.text());
  importMsg.value = result.ok
    ? { ok: true, text: t("settings.backup.imported") }
    : { ok: false, text: result.error ?? t("settings.backup.importFailed") };
  setTimeout(() => (importMsg.value = null), 4000);
}

function doReset(): void {
  if (!confirm(t("settings.backup.resetConfirm"))) return;
  settings.reset();
  player.syncCrossfade();
  player.syncEqualizer();
}
</script>

<template>
  <div class="page settings-page">
    <h1 class="page-title">{{ t("nav.settings") }}</h1>

    <div class="settings-layout">
      <nav class="settings-tabs" role="tablist" :aria-label="t('settings.sections')">
        <button
          v-for="item in TABS"
          :key="item.id"
          class="settings-tab"
          :class="{ 'settings-tab-active': tab === item.id }"
          role="tab"
          :aria-selected="tab === item.id"
          @click="tab = item.id"
        >
          <AppIcon :name="item.icon" :size="18" />
          <span>{{ t(`settings.tab.${item.id}`) }}</span>
        </button>
      </nav>

      <div class="settings-content" role="tabpanel">
        <!-- Appearance -->
        <template v-if="tab === 'appearance'">
          <div class="settings-block">
            <h3 class="settings-block-title">{{ t("settings.profile.title") }}</h3>
            <SettingsRow
              :label="t('settings.profile.language')"
              :hint="t('settings.profile.languageHint')"
            >
              <SelectField
                v-model="settings.profile.language"
                :options="LANGUAGES"
                :label="t('settings.profile.language')"
              />
            </SettingsRow>
            <SettingsRow :label="t('settings.profile.name')" :hint="t('settings.profile.nameHint')">
              <input
                v-model="settings.profile.displayName"
                class="input settings-text"
                :placeholder="session.username ?? 'Your name'"
                :aria-label="t('settings.profile.name')"
              />
            </SettingsRow>
          </div>

          <div class="settings-block">
            <h3 class="settings-block-title">{{ t("settings.layout.title") }}</h3>
            <SettingsRow
              :label="t('settings.layout.density')"
              :hint="t('settings.layout.densityHint')"
            >
              <SelectField
                v-model="settings.layout.density"
                :options="DENSITIES"
                :label="t('settings.layout.density')"
              />
            </SettingsRow>
            <SettingsRow
              :label="t('settings.layout.coverSize')"
              :hint="t('settings.layout.coverSizeHint')"
            >
              <SelectField
                v-model="settings.layout.coverArtSize"
                :options="COVER_SIZES"
                :label="t('settings.layout.coverSize')"
              />
            </SettingsRow>
            <SettingsRow
              :label="t('settings.layout.landing')"
              :hint="t('settings.layout.landingHint')"
            >
              <SelectField
                v-model="settings.layout.defaultLanding"
                :options="LANDINGS"
                :label="t('settings.layout.landing')"
              />
            </SettingsRow>
            <SettingsRow :label="t('settings.layout.showQueue')">
              <ToggleSwitch
                v-model="settings.layout.showQueuePanel"
                :label="t('settings.layout.showQueueShort')"
              />
            </SettingsRow>
            <SettingsRow :label="t('settings.layout.showLyrics')">
              <ToggleSwitch
                v-model="settings.layout.showLyricsPanel"
                :label="t('settings.layout.showLyricsShort')"
              />
            </SettingsRow>
            <SettingsRow
              :label="t('settings.layout.playCounts')"
              :hint="t('settings.layout.playCountsHint')"
            >
              <ToggleSwitch
                v-model="settings.layout.showPlayCounts"
                :label="t('settings.layout.playCounts')"
              />
            </SettingsRow>
          </div>

          <div class="settings-block">
            <h3 class="settings-block-title">{{ t("settings.fullScreen.title") }}</h3>
            <SettingsRow
              :label="t('settings.fullScreen.backdrop')"
              :hint="t('settings.fullScreen.backdropHint')"
            >
              <ToggleSwitch
                v-model="settings.layout.fullScreenBackdrop"
                :label="t('settings.fullScreen.backdrop')"
              />
            </SettingsRow>
          </div>
        </template>

        <!-- Playback -->
        <template v-else-if="tab === 'playback'">
          <div class="settings-block">
            <h3 class="settings-block-title">{{ t("settings.tab.playback") }}</h3>
            <SettingsRow :label="t('settings.playback.defaultVolume')">
              <RangeField
                v-model="settings.playback.defaultVolume"
                :min="0"
                :max="100"
                suffix="%"
                :label="t('settings.playback.defaultVolume')"
              />
            </SettingsRow>
            <SettingsRow
              :label="t('settings.playback.crossfade')"
              :hint="t('settings.playback.crossfadeHint')"
            >
              <RangeField
                v-model="crossfade"
                :min="0"
                :max="12"
                suffix="s"
                :label="t('settings.playback.crossfade')"
              />
            </SettingsRow>
            <SettingsRow
              :label="t('settings.playback.gapless')"
              :hint="t('settings.playback.gaplessHint')"
            >
              <ToggleSwitch
                v-model="settings.playback.gapless"
                :label="t('settings.playback.gaplessShort')"
              />
            </SettingsRow>
            <SettingsRow
              :label="t('settings.playback.infiniteRadio')"
              :hint="t('settings.playback.infiniteRadioHint')"
            >
              <ToggleSwitch
                v-model="settings.playback.autoplay"
                :label="t('settings.playback.infiniteRadio')"
              />
            </SettingsRow>
            <SettingsRow
              :label="t('settings.playback.onlineLyrics')"
              :hint="t('settings.playback.onlineLyricsHint')"
            >
              <ToggleSwitch
                v-model="settings.playback.onlineLyrics"
                :label="t('settings.playback.onlineLyrics')"
              />
            </SettingsRow>
            <SettingsRow
              :label="t('settings.playback.forgottenGems')"
              :hint="t('settings.playback.forgottenGemsHint')"
            >
              <ToggleSwitch
                v-model="settings.playback.forgottenGems"
                :label="t('settings.playback.forgottenGems')"
              />
            </SettingsRow>
            <SettingsRow
              :label="t('settings.playback.scrobble')"
              :hint="t('settings.playback.scrobbleHint')"
            >
              <ToggleSwitch
                v-model="settings.playback.scrobble"
                :label="t('settings.playback.scrobbleShort')"
              />
            </SettingsRow>
            <SettingsRow
              :label="t('settings.playback.normalization')"
              :hint="t('settings.playback.normalizationHint')"
            >
              <SelectField
                v-model="settings.playback.replayGain.mode"
                :options="REPLAY_GAIN"
                :label="t('settings.playback.normalization')"
              />
            </SettingsRow>
            <SettingsRow
              v-if="settings.playback.replayGain.mode !== 'off'"
              :label="t('settings.playback.preamp')"
            >
              <RangeField
                v-model="settings.playback.replayGain.preAmpDb"
                :min="-12"
                :max="12"
                suffix=" dB"
                :label="t('settings.playback.preamp')"
              />
            </SettingsRow>
            <SettingsRow
              :label="t('settings.playback.maxBitrate')"
              :hint="t('settings.playback.maxBitrateHint')"
            >
              <SelectField
                v-model="maxBitRate"
                :options="BITRATES"
                :label="t('settings.playback.maxBitrate')"
              />
            </SettingsRow>
            <SettingsRow
              :label="t('settings.playback.resume')"
              :hint="t('settings.playback.resumeHint')"
            >
              <ToggleSwitch
                v-model="settings.playback.resumeQueueOnLaunch"
                :label="t('settings.playback.resumeShort')"
              />
            </SettingsRow>
          </div>

          <EqualizerEditor />
        </template>

        <!-- Connection -->
        <template v-else-if="tab === 'connection'">
          <ServerInfo />

          <div class="settings-block">
            <h3 class="settings-block-title">{{ t("settings.install.title") }}</h3>
            <p v-if="pwa.isInstalled.value" class="muted settings-hint">
              {{ t("settings.install.installed") }}
            </p>
            <template v-else-if="pwa.canPrompt.value">
              <p class="muted settings-hint">
                {{ t("settings.install.pitch") }}
              </p>
              <div class="settings-actions">
                <button class="btn btn-primary" @click="pwa.prompt()">
                  <AppIcon name="download" :size="16" /> {{ t("settings.install.button") }}
                </button>
              </div>
            </template>
            <p v-else class="muted settings-hint">
              {{ pwa.isIos ? t("settings.install.ios") : t("settings.install.browser") }}
            </p>
          </div>
        </template>

        <!-- Advanced -->
        <template v-else>
          <ShortcutsEditor />

          <div class="settings-block">
            <h3 class="settings-block-title">{{ t("settings.performance.title") }}</h3>
            <SettingsRow
              :label="t('settings.performance.prefetch')"
              :hint="t('settings.performance.prefetchHint')"
            >
              <ToggleSwitch
                v-model="settings.power.prefetch.enabled"
                :label="t('settings.performance.prefetchShort')"
              />
            </SettingsRow>
            <SettingsRow
              :label="t('settings.performance.artCache')"
              :hint="t('settings.performance.artCacheHint')"
            >
              <RangeField
                v-model="settings.power.coverArtCacheMB"
                :min="0"
                :max="500"
                :step="25"
                suffix=" MB"
                :label="t('settings.performance.artCache')"
              />
            </SettingsRow>
            <SettingsRow
              :label="t('settings.performance.libraryCache')"
              :hint="t('settings.performance.libraryCacheHint')"
            >
              <RangeField
                v-model="libraryStaleMinutes"
                :min="1"
                :max="60"
                :suffix="` ${t('common.minutesShort')}`"
                :label="t('settings.performance.libraryCache')"
              />
            </SettingsRow>
          </div>

          <div class="settings-block">
            <h3 class="settings-block-title">{{ t("settings.developer.title") }}</h3>
            <SettingsRow
              :label="t('settings.developer.debugPanel')"
              :hint="t('settings.developer.debugPanelHint')"
            >
              <ToggleSwitch
                v-model="settings.power.developer.debugPanel"
                :label="t('settings.developer.debugPanel')"
              />
            </SettingsRow>
            <SettingsRow :label="t('settings.developer.logLevel')">
              <SelectField
                v-model="settings.power.developer.logLevel"
                :options="LOG_LEVELS"
                :label="t('settings.developer.logLevel')"
              />
            </SettingsRow>
            <DebugPanel v-if="settings.power.developer.debugPanel" />
            <SettingsRow
              :label="t('settings.developer.logs')"
              :hint="t('settings.developer.logsHint')"
            >
              <ToggleSwitch v-model="showLogs" :label="t('settings.developer.logs')" />
            </SettingsRow>
            <LogViewer v-if="showLogs" />
          </div>

          <div class="settings-block">
            <h3 class="settings-block-title">{{ t("settings.backup.title") }}</h3>
            <p class="muted settings-hint">
              {{ t("settings.backup.hint") }}
            </p>
            <div class="settings-actions">
              <button class="btn" @click="doExport">
                <AppIcon name="share" :size="16" /> {{ t("settings.backup.export") }}
              </button>
              <label class="btn">
                <AppIcon name="plus" :size="16" /> {{ t("settings.backup.import") }}
                <input type="file" accept="application/json" hidden @change="doImport" />
              </label>
              <button class="btn" @click="doReset">
                <AppIcon name="trash" :size="16" /> {{ t("settings.backup.reset") }}
              </button>
            </div>
            <p
              v-if="importMsg"
              class="settings-import-msg"
              :class="{ 'settings-import-err': !importMsg.ok }"
              role="status"
            >
              {{ importMsg.text }}
            </p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
