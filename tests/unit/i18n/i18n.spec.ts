import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import LoginScreen from "@/components/auth/LoginScreen.vue";
import { currentLocale, i18n, resolveLocale, setLocale } from "@/i18n";
import en from "@/i18n/locales/en";
import pt from "@/i18n/locales/pt";
import { formatCount, formatListeningTime, formatLongDuration, formatNumber } from "@/lib/format";
import { useSessionStore } from "@/stores/session";
import { applyLanguageSetting, useSettingsStore } from "@/stores/settings";

jest.mock("@/lib/env", () => ({ NAVIDROME_URL_ENV: "https://music.example.com" }));

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("locale files", () => {
  const english = flatten(en);
  const portuguese = flatten(pt);

  it("translate every English message into Portuguese", () => {
    expect([...portuguese.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, message] of portuguese) expect([key, message.trim()]).not.toEqual([key, ""]);
  });

  it("keep the same placeholders and plural forms", () => {
    for (const [key, message] of english) {
      const translated = portuguese.get(key) ?? "";
      expect([key, placeholders(translated)]).toEqual([key, placeholders(message)]);
      expect([key, translated.split("|").length]).toEqual([key, message.split("|").length]);
    }
  });
});

describe("resolveLocale", () => {
  it("uses an explicit choice whatever the browser prefers", () => {
    expect(resolveLocale("pt", ["en-GB"])).toBe("pt");
    expect(resolveLocale("en", ["pt-PT"])).toBe("en");
  });

  it("follows the first supported browser language on automatic", () => {
    expect(resolveLocale("auto", ["pt-PT", "en"])).toBe("pt");
    expect(resolveLocale("auto", ["pt-BR"])).toBe("pt");
    expect(resolveLocale("auto", ["fr-FR", "pt", "en"])).toBe("pt");
    expect(resolveLocale("auto", ["en-US", "pt-PT"])).toBe("en");
  });

  it("falls back to English", () => {
    expect(resolveLocale("auto", ["fr-FR", "de"])).toBe("en");
    expect(resolveLocale("auto", [])).toBe("en");
  });
});

describe("formatting", () => {
  it("pluralises counts in English", () => {
    expect(formatCount(0, "track")).toBe("0 tracks");
    expect(formatCount(1, "track")).toBe("1 track");
    expect(formatCount(2, "album")).toBe("2 albums");
  });

  it("pluralises counts and groups digits in Portuguese", () => {
    setLocale("pt");
    expect(formatCount(1, "track")).toBe("1 faixa");
    expect(formatCount(12, "album")).toBe("12 álbuns");
    expect(formatCount(1, "file")).toBe("1 ficheiro");
    // pt-PT groups thousands with a (narrow) non-breaking space.
    expect(formatNumber(12345).replace(/\s/g, " ")).toBe("12 345");
  });

  it("localises durations", () => {
    expect(formatLongDuration(3900)).toBe("1 hr 5 min");
    expect(formatListeningTime(3 * 86400 + 2 * 3600)).toBe("3 days 2 hr");
    setLocale("pt");
    expect(formatLongDuration(3900)).toBe("1 h 5 min");
    expect(formatListeningTime(86400 * 3)).toBe("3 dias");
  });

  it("marks the page language for assistive technology", () => {
    setLocale("pt");
    expect(document.documentElement.lang).toBe("pt-PT");
    setLocale("en");
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("Language setting", () => {
  it("switches the interface when the setting changes", async () => {
    setActivePinia(createPinia());
    const settings = useSettingsStore();
    settings.profile.language = "en";
    applyLanguageSetting();
    expect(currentLocale()).toBe("en");
    settings.profile.language = "pt";
    await nextTick();
    expect(currentLocale()).toBe("pt");
    expect(i18n.global.t("nav.settings")).toBe("Definições");
  });

  it("renders the login screen in Portuguese", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore().init(false);
    setLocale("pt");
    const wrapper = mount(LoginScreen, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(wrapper.get('label[for="username"]').text()).toBe("Nome de utilizador");
    expect(wrapper.get('label[for="password"]').text()).toBe("Palavra-passe");
    expect(wrapper.get('button[type="submit"]').text()).toBe("Iniciar sessão");
    expect(wrapper.find('button[aria-label="Mostrar palavra-passe"]').exists()).toBe(true);
  });
});
