import * as serverCopy from "../../../server/appName";
import {
  APP_NAME_MAX_LENGTH,
  DEFAULT_APP_NAME,
  normalizeAppName,
  resolveAppName,
} from "@/lib/appName";
import { appNameFromPage } from "@/lib/branding";

const SAMPLES: (string | null | undefined)[] = [
  undefined,
  null,
  "",
  "   ",
  "\n\t",
  "Family Music",
  "  Family   Music  ",
  "Música\nda Família",
  "Bad\u0000Name\u007f",
  "<script>alert(1)</script>",
  "🎵".repeat(60),
  "x".repeat(APP_NAME_MAX_LENGTH + 10),
  `${"a".repeat(APP_NAME_MAX_LENGTH - 1)} tail`,
];

describe("normalizeAppName", () => {
  it("defaults to NaviPlayer when unset or blank", () => {
    expect(DEFAULT_APP_NAME).toBe("NaviPlayer");
    for (const raw of [undefined, null, "", "   ", "\n\t"]) {
      expect(normalizeAppName(raw)).toBeNull();
      expect(resolveAppName(raw)).toBe("NaviPlayer");
    }
  });

  it("uses the configured name, tidied", () => {
    expect(resolveAppName("Family Music")).toBe("Family Music");
    expect(resolveAppName("  Family   Music  ")).toBe("Family Music");
    expect(resolveAppName("Música\nda Família")).toBe("Música da Família");
    expect(resolveAppName("Bad\u0000Name\u007f")).toBe("Bad Name");
  });

  it("caps the length without splitting characters or leaving a trailing space", () => {
    expect(resolveAppName("x".repeat(100))).toHaveLength(APP_NAME_MAX_LENGTH);
    expect([...resolveAppName("🎵".repeat(60))]).toHaveLength(APP_NAME_MAX_LENGTH);
    expect(resolveAppName(`${"a".repeat(APP_NAME_MAX_LENGTH - 1)} tail`)).toBe(
      "a".repeat(APP_NAME_MAX_LENGTH - 1),
    );
  });

  it("leaves escaping to whoever renders it", () => {
    // Vue templates and the HTML writers escape; the name itself is kept as text.
    expect(resolveAppName("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
  });

  it("behaves identically in the server's copy", () => {
    expect(serverCopy.DEFAULT_APP_NAME).toBe(DEFAULT_APP_NAME);
    expect(serverCopy.APP_NAME_MAX_LENGTH).toBe(APP_NAME_MAX_LENGTH);
    for (const raw of SAMPLES) {
      expect(serverCopy.normalizeAppName(raw)).toBe(normalizeAppName(raw));
    }
  });
});

describe("appNameFromPage", () => {
  function page(html: string): Document {
    return new DOMParser().parseFromString(html, "text/html");
  }

  it("reads the name the page was built or served with", () => {
    const doc = page('<head><meta name="application-name" content="Family &amp; Friends"></head>');
    expect(appNameFromPage(doc)).toBe("Family & Friends");
  });

  it("returns null without a usable tag, so the build-time value applies", () => {
    expect(appNameFromPage(page("<head></head>"))).toBeNull();
    expect(
      appNameFromPage(page('<head><meta name="application-name" content=" "></head>')),
    ).toBeNull();
    expect(appNameFromPage(undefined)).toBeNull();
  });
});
