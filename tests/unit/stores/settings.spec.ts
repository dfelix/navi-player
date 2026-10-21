import { createPinia, setActivePinia } from "pinia";
import { DEFAULT_SETTINGS } from "@/lib/settingsSchema";
import { persistSettingsOnChange, useSettingsStore } from "@/stores/settings";
import { nextTick } from "vue";

describe("settings store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("has no theme, desktop or update sections", () => {
    for (const gone of ["theme", "desktop", "updates"]) {
      expect(DEFAULT_SETTINGS).not.toHaveProperty(gone);
    }
  });

  it("drops unknown sections and wrong-typed values on import", () => {
    const settings = useSettingsStore();
    const result = settings.importJson(
      JSON.stringify({
        version: 1,
        theme: { preset: "dracula", colors: { accent: "#ff00ff" } },
        desktop: { appIcon: "rose" },
        updates: { autoCheck: true },
        layout: { density: "compact", showPlayCounts: "yes please" },
        playback: { crossfadeSeconds: 4, equalizer: { gains: { 0: 12 } } },
      }),
    );
    expect(result.ok).toBe(true);

    const exported = JSON.parse(settings.exportJson()) as Record<string, unknown>;
    for (const gone of ["theme", "desktop", "updates"]) expect(exported).not.toHaveProperty(gone);
    expect(settings.layout.density).toBe("compact");
    expect(settings.playback.crossfadeSeconds).toBe(4);
    expect(settings.layout.showPlayCounts).toBe(true);
    expect(settings.playback.equalizer.gains).toEqual(Array(10).fill(0));
  });

  it("rejects files that aren't settings exports", () => {
    const settings = useSettingsStore();
    expect(settings.importJson("not json").ok).toBe(false);
    expect(settings.importJson(JSON.stringify({ layout: {} })).ok).toBe(false);
  });

  it("persists any change, including direct v-model style mutations", async () => {
    persistSettingsOnChange();
    const settings = useSettingsStore();
    settings.layout.density = "spacious";
    await nextTick();
    const saved = JSON.parse(localStorage.getItem("navi-player:settings") ?? "{}");
    expect(saved.layout.density).toBe("spacious");
  });

  it("resets to the defaults", () => {
    const settings = useSettingsStore();
    settings.playback.crossfadeSeconds = 9;
    settings.reset();
    expect(settings.playback.crossfadeSeconds).toBe(DEFAULT_SETTINGS.playback.crossfadeSeconds);
  });
});
