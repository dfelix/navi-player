import { flushPromises, mount } from "@vue/test-utils";
import SettingsView from "@/views/SettingsView.vue";
import { setLocale } from "@/i18n";
import { saveCredentials } from "@/api/credentials";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { appPlugins, mockFetch, subsonicOk } from "../../helpers";

jest.mock("@/lib/env", () => ({ NAVIDROME_URL_ENV: "https://music.example.com" }));

async function mountSettings(path = "/settings") {
  mockFetch(() => subsonicOk({ type: "navidrome", serverVersion: "0.55.0" }));
  const plugins = await appPlugins(path);
  saveCredentials({
    serverUrl: "https://music.example.com",
    username: "alice",
    authMethod: "native",
    subsonicSalt: "s",
    subsonicToken: "t",
    jwt: "jwt",
    savedAt: 0,
  });
  useSessionStore().init(false);
  const wrapper = mount(SettingsView, { global: { plugins: [...plugins] } });
  await flushPromises();
  return wrapper;
}

const BANNED = [/theme/i, /desktop app/i, /update/i, /jellyfin/i, /app icon/i, /accent colou?r/i];

describe("SettingsView", () => {
  it("offers a language choice and renders in Portuguese", async () => {
    const wrapper = await mountSettings();
    expect(wrapper.text()).toContain("Language");
    expect(wrapper.text()).toContain("Português");
    setLocale("pt");
    await flushPromises();
    expect(wrapper.findAll('[role="tab"]').map((t) => t.text())).toEqual([
      "Aspeto",
      "Reprodução",
      "Ligação",
      "Avançadas",
    ]);
    expect(wrapper.text()).toContain("Idioma");
  });

  it("has Appearance, Playback, Connection and Advanced tabs", async () => {
    const wrapper = await mountSettings();
    expect(wrapper.findAll('[role="tab"]').map((t) => t.text())).toEqual([
      "Appearance",
      "Playback",
      "Connection",
      "Advanced",
    ]);
  });

  it("offers no theme presets, desktop, update or Jellyfin settings on any tab", async () => {
    const wrapper = await mountSettings();
    for (const tab of wrapper.findAll('[role="tab"]')) {
      await tab.trigger("click");
      await flushPromises();
      // The equalizer's audio presets (Bass Boost, Rock…) are not colour themes.
      const text = wrapper.get('[role="tabpanel"]').text();
      for (const re of BANNED) expect(text).not.toMatch(re);
    }
  });

  it("shows the configured server as read-only information", async () => {
    const wrapper = await mountSettings("/settings?tab=connection");
    const panel = wrapper.get('[role="tabpanel"]');
    expect(panel.text()).toContain("Server version0.55.0");
    // Listeners see a generic music server, not the software behind it.
    expect(panel.text()).not.toMatch(/navidrome|subsonic/i);
    expect(panel.text()).toContain("music.example.com");
    expect(panel.findAll('input[type="text"], input[type="url"], input:not([type])')).toHaveLength(
      0,
    );
  });

  it("binds controls straight to the settings store", async () => {
    const wrapper = await mountSettings("/settings?tab=playback");
    const settings = useSettingsStore();
    const before = settings.playback.gapless;
    await wrapper.get('[role="switch"][aria-label="Gapless"]').trigger("click");
    expect(settings.playback.gapless).toBe(!before);
  });

  it("shows recent logs on the Advanced tab when asked", async () => {
    const wrapper = await mountSettings();
    const advanced = wrapper.findAll('[role="tab"]').find((t) => t.text() === "Advanced")!;
    await advanced.trigger("click");
    expect(wrapper.find(".log-viewer").exists()).toBe(false);
    const toggle = wrapper.get('[role="switch"][aria-label="Recent logs"]');
    await toggle.trigger("click");
    expect(wrapper.find(".log-viewer").exists()).toBe(true);
  });
});
