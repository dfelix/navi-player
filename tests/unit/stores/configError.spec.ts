// A deployment without VITE_NAVIDROME_URL shows an explanation, not a login form.
import { createPinia, setActivePinia } from "pinia";
import { useSessionStore } from "@/stores/session";

jest.mock("@/lib/env", () => ({ NAVIDROME_URL_ENV: undefined }));

it("reports a missing server URL as a configuration error", () => {
  setActivePinia(createPinia());
  const session = useSessionStore();
  session.init(false);
  expect(session.ready).toBe(true);
  expect(session.apiBase).toBeNull();
  expect(session.configError).toMatch(/VITE_NAVIDROME_URL is not set/);
});

it("still works when the bundled server proxies Navidrome", () => {
  setActivePinia(createPinia());
  const session = useSessionStore();
  session.init(true);
  expect(session.configError).toBeNull();
  expect(session.apiBase).toBe(window.location.origin);
});
