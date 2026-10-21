<script setup lang="ts">
// The equaliser settings: on/off, presets (built-in and your own), the
// pre-amp and ten bands. It's all stored in settings, and every change goes
// straight to the audio engine (player.syncEqualizer).
import { computed, ref } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import {
  EQ_BAND_LABELS,
  EQ_GAIN_LIMIT,
  EQ_PRESETS,
  type EqualizerPreset,
} from "@/lib/settingsSchema";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import ToggleSwitch from "./ToggleSwitch.vue";
import "./equalizer.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const settings = useSettingsStore();
const player = usePlayerStore();
const session = useSessionStore();

const eq = computed(() => settings.playback.equalizer);
const savePresetName = ref("");
const eqError = ref(false);

const sameCurve = (a: number[], b: number[]) =>
  a.length === b.length && a.every((gain, i) => gain === b[i]);

// "+3", "0", "-2"
const fmt = (db: number) => (db > 0 ? `+${db}` : String(db));

// Send the settings to the engine; flag it if the equaliser couldn't start.
function apply(): void {
  eqError.value = eq.value.enabled && !player.syncEqualizer();
}

const enabled = computed({
  get: () => eq.value.enabled,
  set: (on: boolean) => {
    eq.value.enabled = on;
    apply();
  },
});

// The preset the bands now match, so moving a band shows "Custom". Presets
// don't include a pre-amp, so any pre-amp makes it custom too.
function matchingPreset(): string {
  const { gains, preampDb, userPresets } = eq.value;
  if (preampDb !== 0) return "custom";
  const match = [...EQ_PRESETS, ...userPresets].find((preset) => sameCurve(preset.gains, gains));
  return match?.id ?? "custom";
}

const sliderValue = (event: Event) => Number((event.target as HTMLInputElement).value);

function setBand(index: number, event: Event): void {
  eq.value.gains[index] = sliderValue(event);
  eq.value.preset = matchingPreset();
  apply();
}

function setPreamp(event: Event): void {
  eq.value.preampDb = sliderValue(event);
  eq.value.preset = matchingPreset();
  apply();
}

function applyPreset(id: string): void {
  const preset = [...EQ_PRESETS, ...eq.value.userPresets].find((p) => p.id === id);
  if (!preset) return;
  eq.value.gains = [...preset.gains];
  eq.value.preset = id;
  if (id === "flat") eq.value.preampDb = 0;
  apply();
}

function resetFlat(): void {
  applyPreset("flat");
}

function saveUserPreset(): void {
  const name = savePresetName.value.trim();
  if (!name) return;
  const saved: EqualizerPreset = { id: `eq-${Date.now()}`, name, gains: [...eq.value.gains] };
  eq.value.userPresets = [...eq.value.userPresets, saved];
  eq.value.preset = saved.id;
  savePresetName.value = "";
}

function deleteUserPreset(id: string): void {
  eq.value.userPresets = eq.value.userPresets.filter((preset) => preset.id !== id);
  if (eq.value.preset === id) eq.value.preset = "custom";
}

// Only worth mentioning when the equaliser is on and the music server is on
// another address: then, without CORS on that server, it can go silent.
const showCorsHint = computed(() => eq.value.enabled && !session.apiIsSameOrigin);
</script>

<template>
  <div class="settings-block eq-block">
    <div class="settings-block-head">
      <h3 class="settings-block-title">{{ t("equalizer.title") }}</h3>
      <ToggleSwitch v-model="enabled" :label="t('equalizer.enable')" />
    </div>

    <p v-if="!player.equalizerAvailable()" class="muted settings-hint">
      {{ t("equalizer.unsupported") }}
    </p>

    <p v-if="eqError" class="eq-warning" role="alert">
      <AppIcon name="volume-mute" :size="15" />
      {{ t("equalizer.tapFailed") }}
    </p>

    <i18n-t
      v-if="showCorsHint"
      keypath="equalizer.corsHint"
      tag="p"
      class="muted settings-hint eq-cors-hint"
    >
      <template #header>
        <code>Access-Control-Allow-Origin</code>
      </template>
    </i18n-t>

    <fieldset class="eq-body" :disabled="!eq.enabled" :aria-disabled="!eq.enabled">
      <div class="eq-controls-row">
        <label class="eq-preset-select">
          <span>{{ t("equalizer.preset.label") }}</span>
          <select
            class="input settings-select"
            :value="eq.preset"
            @change="applyPreset(($event.target as HTMLSelectElement).value)"
          >
            <option v-if="eq.preset === 'custom'" value="custom">
              {{ t("equalizer.custom") }}
            </option>
            <optgroup :label="t('equalizer.builtIn')">
              <option v-for="p in EQ_PRESETS" :key="p.id" :value="p.id">
                {{ t(`equalizer.preset.${p.id}`) }}
              </option>
            </optgroup>
            <optgroup v-if="eq.userPresets.length > 0" :label="t('equalizer.myPresets')">
              <option v-for="p in eq.userPresets" :key="p.id" :value="p.id">{{ p.name }}</option>
            </optgroup>
          </select>
        </label>
        <button class="btn btn-ghost eq-reset" type="button" @click="resetFlat">
          <AppIcon name="repeat" :size="14" /> {{ t("equalizer.reset") }}
        </button>
      </div>

      <div class="eq-graph">
        <div class="eq-band eq-band-preamp">
          <input
            type="range"
            class="eq-slider"
            :min="-EQ_GAIN_LIMIT"
            :max="EQ_GAIN_LIMIT"
            step="1"
            :value="eq.preampDb"
            :aria-label="t('equalizer.preamp')"
            @input="setPreamp"
          />
          <span class="eq-band-value" :class="{ 'eq-band-value-active': eq.preampDb !== 0 }">
            {{ fmt(eq.preampDb) }}
          </span>
          <span class="eq-band-label">{{ t("equalizer.preShort") }}</span>
        </div>

        <div class="eq-divider" />

        <div v-for="(label, i) in EQ_BAND_LABELS" :key="label" class="eq-band">
          <input
            type="range"
            class="eq-slider"
            :min="-EQ_GAIN_LIMIT"
            :max="EQ_GAIN_LIMIT"
            step="1"
            :value="eq.gains[i] ?? 0"
            :aria-label="t('equalizer.band', { freq: label })"
            @input="setBand(i, $event)"
          />
          <span class="eq-band-value" :class="{ 'eq-band-value-active': (eq.gains[i] ?? 0) !== 0 }">
            {{ fmt(eq.gains[i] ?? 0) }}
          </span>
          <span class="eq-band-label">{{ label }}</span>
        </div>
      </div>

      <form class="eq-save-row" @submit.prevent="saveUserPreset">
        <input
          v-model="savePresetName"
          class="input"
          :placeholder="t('equalizer.savePlaceholder')"
          :aria-label="t('equalizer.presetName')"
        />
        <button class="btn btn-primary" type="submit" :disabled="!savePresetName.trim()">
          <AppIcon name="plus" :size="15" /> {{ t("equalizer.savePreset") }}
        </button>
      </form>

      <div v-if="eq.userPresets.length > 0" class="eq-user-presets">
        <span
          v-for="p in eq.userPresets"
          :key="p.id"
          class="eq-user-chip"
          :class="{ 'eq-user-chip-active': eq.preset === p.id }"
        >
          <button type="button" class="eq-user-chip-name" @click="applyPreset(p.id)">
            {{ p.name }}
          </button>
          <button
            type="button"
            class="eq-user-chip-del"
            :aria-label="t('equalizer.deletePreset', { name: p.name })"
            @click="deleteUserPreset(p.id)"
          >
            <AppIcon name="close" :size="12" />
          </button>
        </span>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
/* Name and delete are sibling buttons (a button can't contain a button). */
.eq-user-chip-name {
  font: inherit;
  color: inherit;
}
</style>
