// Browser APIs the app relies on that jsdom doesn't provide. Skipped for specs
// that opt into the Node environment.

import { config } from "@vue/test-utils";
import { i18n, setLocale } from "@/i18n";

if (typeof window !== "undefined") {
  // Every mounted component can translate, as it can in the app. Tests run in
  // English unless they switch locale themselves.
  config.global.plugins.push(i18n);
  beforeEach(() => setLocale("en"));

  if (typeof AbortSignal.timeout !== "function") {
    AbortSignal.timeout = () => new AbortController().signal;
  }

  // jsdom has no media playback: make the element methods inert.
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: () => Promise.resolve(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(HTMLMediaElement.prototype, "load", {
    configurable: true,
    value: () => {},
  });

  // Each test starts with empty storage.
  beforeEach(() => {
    localStorage.clear();
  });
}
