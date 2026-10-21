import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LogViewer from "@/components/settings/LogViewer.vue";
import { clearLogHistory, log, logHistory } from "@/lib/log";
import { useSettingsStore } from "@/stores/settings";

beforeEach(() => {
  setActivePinia(createPinia());
  clearLogHistory();
  for (const method of ["error", "warn", "log", "debug"] as const) {
    jest.spyOn(console, method).mockImplementation(() => {});
  }
  useSettingsStore().power.developer.logLevel = "debug";
});

afterEach(() => jest.restoreAllMocks());

const rows = (w: ReturnType<typeof mount>) => w.findAll(".log-entry").map((r) => r.text());

describe("LogViewer", () => {
  it("says so when nothing has been logged", () => {
    const wrapper = mount(LogViewer);
    expect(wrapper.text()).toContain("Nothing logged yet");
    expect(wrapper.text()).toContain("No messages");
  });

  it("lists messages newest first and updates as they arrive", async () => {
    const wrapper = mount(LogViewer);
    log.info("lrclib", "first");
    log.warn("lrclib", "second");
    await flushPromises();
    expect(rows(wrapper)).toEqual([
      expect.stringMatching(/warn\s*\[lrclib\]\s*second$/),
      expect.stringMatching(/info\s*\[lrclib\]\s*first$/),
    ]);
    expect(wrapper.text()).toContain("2 messages");
  });

  it("filters by subsystem", async () => {
    log.info("lrclib", "words");
    log.info("radio", "picks");
    const wrapper = mount(LogViewer);
    await wrapper.get("select").setValue("radio");
    expect(rows(wrapper)).toEqual([expect.stringContaining("picks")]);
  });

  it("copies oldest first, the way a log file reads", async () => {
    const writeText = jest.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    log.info("lrclib", "first");
    log.info("lrclib", "second");
    const wrapper = mount(LogViewer);
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "Copy")!
      .trigger("click");
    const copied = (writeText.mock.calls[0] as unknown as [string])[0].split("\n");
    expect(copied).toEqual([
      expect.stringMatching(/Z INFO \[lrclib\] first$/),
      expect.stringMatching(/Z INFO \[lrclib\] second$/),
    ]);
    await flushPromises();
    expect(wrapper.text()).toContain("Copied");
  });

  it("clears the history", async () => {
    log.info("lrclib", "words");
    const wrapper = mount(LogViewer);
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "Clear")!
      .trigger("click");
    expect(logHistory.value).toHaveLength(0);
    expect(wrapper.text()).toContain("Nothing logged yet");
  });
});
