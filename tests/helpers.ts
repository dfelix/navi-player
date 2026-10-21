// Shared test helpers.

import { jest } from "@jest/globals";
import type { Plugin } from "vue";

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

// Replace global fetch with a router over the given handler, recording every
// request URL. Responses are real Response objects so the app's parsing runs
// unmodified.
export function mockFetch(handler: Handler) {
  const calls: URL[] = [];
  const fn = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      "http://localhost",
    );
    calls.push(url);
    return handler(url, init);
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return { fn, calls };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function subsonicOk(body: Record<string, unknown> = {}): Response {
  return json({ "subsonic-response": { status: "ok", version: "1.16.1", ...body } });
}

// Plugins a full page needs: Pinia, a router at `path`, and Vue Query.
export async function appPlugins(path = "/"): Promise<(Plugin | [Plugin, unknown])[]> {
  const { createPinia, setActivePinia } = await import("pinia");
  const { createMemoryHistory, createRouter } = await import("vue-router");
  const { QueryClient, VueQueryPlugin } = await import("@tanstack/vue-query");
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }],
  });
  await router.push(path);
  await router.isReady();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return [pinia, router, [VueQueryPlugin, { queryClient }]];
}
