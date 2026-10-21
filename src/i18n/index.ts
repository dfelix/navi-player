// Internationalisation. English is the source of truth (locales/en.ts); every
// other locale must have exactly the same keys, which TypeScript enforces.
//
// Components use `useI18n()` / `$t`. Plain modules (stores, services, lib) use
// the exported `t`, which reads the same global instance.

import { createI18n } from "vue-i18n";
import type { LanguageSetting } from "@/lib/settingsSchema";
import en, { type MessageSchema } from "./locales/en";
import pt from "./locales/pt";

export const LOCALES = ["en", "pt"] as const;
export type AppLocale = (typeof LOCALES)[number];

// Native names, so a reader can find their language whatever is selected.
export const LOCALE_NAMES: Record<AppLocale, string> = { en: "English", pt: "Português" };

// BCP 47 tags for the <html lang> attribute and Intl formatting.
const LANG_TAGS: Record<AppLocale, string> = { en: "en", pt: "pt-PT" };

export const i18n = createI18n<[MessageSchema], AppLocale, false>({
  legacy: false,
  locale: "en",
  fallbackLocale: "en",
  messages: { en, pt },
  // Missing keys fall back to English; don't warn about it in the console.
  missingWarn: false,
  fallbackWarn: false,
});

export const t = i18n.global.t;

// Pick the interface language: an explicit setting wins, otherwise the first of
// the browser's preferred languages we support, otherwise English.
export function resolveLocale(
  setting: LanguageSetting,
  preferred: readonly string[] = typeof navigator !== "undefined" ? navigator.languages : [],
): AppLocale {
  if (setting !== "auto") return setting;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if ((LOCALES as readonly string[]).includes(base ?? "")) return base as AppLocale;
  }
  return "en";
}

export function setLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale;
  if (typeof document !== "undefined") document.documentElement.lang = LANG_TAGS[locale];
}

export function currentLocale(): AppLocale {
  return i18n.global.locale.value;
}

// The locale to format numbers and dates with. English keeps the browser's own
// regional conventions (en-GB vs en-US dates); Portuguese uses Portugal's.
export function intlLocale(): string {
  const locale = currentLocale();
  if (locale === "en" && typeof navigator !== "undefined" && navigator.language?.startsWith("en")) {
    return navigator.language;
  }
  return LANG_TAGS[locale];
}
