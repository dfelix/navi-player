// The listener's settings (shape and defaults: lib/settingsSchema), saved in
// localStorage, with export, import and reset. Sign-in details live
// elsewhere, so they can never end up in an export.

import { defineStore } from "pinia";
import { watch } from "vue";
import { resolveLocale, setLocale, t } from "@/i18n";
import { DEFAULT_SETTINGS, SETTINGS_VERSION, type Settings } from "@/lib/settingsSchema";

const KEY = "navi-player:settings";
const SECTIONS = ["profile", "layout", "playback", "power"] as const;

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => !!v && typeof v === "object" && !Array.isArray(v);

const sameKind = (value: unknown, fallback: unknown) =>
  value !== undefined &&
  typeof value === typeof fallback &&
  Array.isArray(value) === Array.isArray(fallback);

// `saved` laid over `defaults`: only keys the defaults have, and only values
// of the same type. Settings added since the save get their default; stale or
// foreign keys (or a hand-edited wrong type) are ignored.
function overlay(defaults: Plain, saved: Plain): Plain {
  const out: Plain = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = saved[key];
    if (isPlain(fallback)) out[key] = overlay(fallback, isPlain(value) ? value : {});
    else out[key] = sameKind(value, fallback) ? value : fallback;
  }
  return out;
}

export function mergeWithDefaults(saved: unknown): Settings {
  const merged = overlay(
    structuredClone(DEFAULT_SETTINGS) as unknown as Plain,
    isPlain(saved) ? saved : {},
  );
  return { ...(merged as unknown as Settings), version: SETTINGS_VERSION };
}

function loadSaved(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? mergeWithDefaults(JSON.parse(raw)) : structuredClone(DEFAULT_SETTINGS);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export interface ImportResult {
  ok: boolean;
  error?: string;
}

// Why an imported file can't be used, or null if it can.
function importProblem(data: unknown): string | null {
  if (!isPlain(data)) return t("settings.backup.notObject");
  if (typeof data.version !== "number") return t("settings.backup.noVersion");
  const bad = SECTIONS.find((section) => data[section] !== undefined && !isPlain(data[section]));
  return bad ? t("settings.backup.badSection", { section: bad }) : null;
}

export const useSettingsStore = defineStore("settings", {
  state: (): Settings => loadSaved(),

  actions: {
    persist(): void {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.$state));
      } catch (err) {
        console.error("[settings] could not be saved", err);
      }
    },

    // Change settings in code. (Saving is automatic: see persistSettingsOnChange.)
    update(change: (settings: Settings) => void): void {
      change(this.$state);
    },

    reset(): void {
      this.$state = structuredClone(DEFAULT_SETTINGS);
      this.persist();
    },

    importJson(json: string): ImportResult {
      let data: unknown;
      try {
        data = JSON.parse(json);
      } catch {
        return { ok: false, error: t("settings.backup.notJson") };
      }
      const problem = importProblem(data);
      if (problem) return { ok: false, error: problem };
      this.$state = mergeWithDefaults(data);
      this.persist();
      return { ok: true };
    },

    // Through the schema, so only settings (nothing else in state) go out.
    exportJson(): string {
      return JSON.stringify(mergeWithDefaults(this.$state), null, 2);
    },
  },
});

// Save on every change, including ones made through v-model. Called once at start.
export function persistSettingsOnChange(): void {
  const store = useSettingsStore();
  store.$subscribe(() => store.persist(), { detached: true });
}

// Keep the interface language (and <html lang>, for screen readers) in step
// with the Language setting.
export function applyLanguageSetting(): void {
  const store = useSettingsStore();
  watch(
    () => store.profile.language,
    (language) => setLocale(resolveLocale(language)),
    { immediate: true },
  );
}
