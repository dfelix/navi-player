// What the bundled NaviPlayer server (server/index.ts) reports about itself.
// Absent entirely when the app is deployed as a plain static bundle.

import { defineStore } from "pinia";

export interface ServerConfig {
  // False when the app is served as a plain static bundle with no backend of
  // ours behind it — then there's nobody to ask about uploads.
  backend: boolean;
  // The backend proxies Navidrome on this origin.
  proxyMode: boolean;
  uploadEnabled: boolean;
  linkPreviews: boolean;
}

export const useServerConfigStore = defineStore("serverConfig", {
  state: () => ({
    loaded: false,
    backend: false,
    proxyMode: false,
    uploadEnabled: false,
    linkPreviews: false,
  }),

  actions: {
    // Called once on boot, before the session is restored, because it decides
    // where API requests go. Resolves regardless of success — a static
    // deployment has no /api/config and talks to VITE_NAVIDROME_URL directly.
    async load(): Promise<void> {
      try {
        const res = await fetch("/api/config", { signal: AbortSignal.timeout(2000) });
        if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
          const data = (await res.json()) as Partial<ServerConfig>;
          if (typeof data.proxyMode === "boolean") {
            this.$patch({
              backend: true,
              proxyMode: data.proxyMode,
              uploadEnabled: !!data.uploadEnabled,
              linkPreviews: !!data.linkPreviews,
            });
          }
        }
      } catch {
        // No backend of ours — static deployment.
      }
      this.loaded = true;
    },
  },
});
