// The in-app log history: follows the Log level setting, stays bounded and
// never holds a credential.
import { createPinia, setActivePinia } from "pinia";
import { LOG_HISTORY_MAX, clearLogHistory, log, logHistory, maskSecrets } from "@/lib/log";
import { useSettingsStore } from "@/stores/settings";

beforeEach(() => {
  setActivePinia(createPinia());
  clearLogHistory();
  for (const method of ["error", "warn", "log", "debug"] as const) {
    jest.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => jest.restoreAllMocks());

const texts = () => logHistory.value.map((e) => `${e.level} [${e.scope}] ${e.text}`);

describe("log history", () => {
  it("records what the log level lets through, and only that", () => {
    useSettingsStore().power.developer.logLevel = "info";
    log.error("a", "broke");
    log.warn("a", "odd");
    log.info("b", "fine");
    log.debug("b", "detail");
    expect(texts()).toEqual(["error [a] broke", "warn [a] odd", "info [b] fine"]);

    useSettingsStore().power.developer.logLevel = "silent";
    log.error("a", "unseen");
    expect(logHistory.value).toHaveLength(3);
  });

  it("turns errors and objects into readable text", () => {
    log.error("x", "failed", new TypeError("network down"), { status: 503 });
    expect(texts()).toEqual(['error [x] failed TypeError: network down {"status":503}']);
  });

  it(`keeps only the last ${LOG_HISTORY_MAX} messages`, () => {
    for (let i = 0; i < LOG_HISTORY_MAX + 20; i++) log.error("n", String(i));
    expect(logHistory.value).toHaveLength(LOG_HISTORY_MAX);
    expect(logHistory.value[0]?.text).toBe("20");
    expect(logHistory.value.at(-1)?.text).toBe(String(LOG_HISTORY_MAX + 19));
  });

  it("masks credentials before keeping them", () => {
    log.error("api", "GET /rest/ping.view?u=alice&t=abc123&s=salt9&v=1.16.1");
    log.error("auth", "header Bearer eyJhbGciOi.payload.sig");
    const all = texts().join("\n");
    expect(all).not.toMatch(/abc123|salt9|eyJhbGciOi/);
    expect(all).toContain("u=alice&t=•••&s=•••&v=1.16.1");
    expect(all).toContain("Bearer •••");
  });
});

describe("maskSecrets", () => {
  it("leaves ordinary text alone", () => {
    const text = '/get?artist_name=Queen&track_name=A Kind of Magic: "s" and "t" are letters';
    expect(maskSecrets(text)).toBe(text);
  });

  it("masks passwords, including the enc: form", () => {
    expect(maskSecrets("x?u=a&p=enc:6869")).toBe("x?u=a&p=•••");
    expect(maskSecrets("x?jwt=a.b.c&f=json")).toBe("x?jwt=•••&f=json");
  });
});
