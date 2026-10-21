import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";
import { defineConfig, loadEnv, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolveAppName } from "./src/lib/appName.ts";
import { LRCLIB_ROUTE, createLrclibRelay } from "./server/lrclib.ts";

// The version is injected at build time rather than hand-maintained.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Fill the configured display name (VITE_APP_NAME, default NaviPlayer) into the
// page shell and the web app manifest. The manifest is generated rather than
// copied from public/, so an installed app is named after the deployment too.
function appBranding(name: string): Plugin {
  const template = fileURLToPath(new URL("./src/manifest.webmanifest", import.meta.url));
  const manifest = () => {
    const parsed = JSON.parse(readFileSync(template, "utf8")) as Record<string, unknown>;
    return `${JSON.stringify({ ...parsed, name, short_name: name }, null, 2)}\n`;
  };
  return {
    name: "navi-player-branding",
    // "pre", so the placeholder is gone before Vite's own %ENV% substitution.
    transformIndexHtml: {
      order: "pre",
      handler: (html) => html.replaceAll("%APP_NAME%", escapeHtml(name)),
    },
    configureServer(server) {
      server.middlewares.use("/manifest.webmanifest", (_req, res) => {
        res.setHeader("Content-Type", "application/manifest+json");
        res.end(manifest());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: manifest() });
    },
  };
}

// The same LRCLIB relay the production server mounts (server/lrclib.ts), so
// online lyrics behave identically in development.
function lrclibRelay(): Plugin {
  return {
    name: "navi-player-lrclib",
    configureServer(server) {
      const relay = createLrclibRelay({ userAgent: `navi-player/${pkg.version}` });
      server.middlewares.use(LRCLIB_ROUTE, (req, res, next) => {
        if (req.method !== "GET") return next();
        const url = new URL(req.url ?? "/", "http://dev");
        void relay(url.pathname.replace(/^\/+/, ""), url.searchParams).then((result) => {
          res.statusCode = result.status;
          for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
          res.end(result.body);
        }, next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // VITE_NAVIDROME_URL is the one setting NaviPlayer needs. Vite inlines it into
  // the bundle (import.meta.env) on its own; loadEnv makes it available here
  // too, from .env / .env.local / the environment, so the dev server can proxy
  // the API on its own origin. That spares local development any CORS setup —
  // the same thing the bundled production server does.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const navidromeUrl = (env.VITE_NAVIDROME_URL ?? "").trim().replace(/\/+$/, "");
  const appName = resolveAppName(env.VITE_APP_NAME);

  return {
    plugins: [
      vue(),
      appBranding(appName),
      lrclibRelay(),
      {
        // In dev the app talks to Navidrome through the proxy below, exactly as
        // it does behind the bundled server — so answer the config probe the
        // same way that server would.
        name: "navi-player-dev-config",
        configureServer(server) {
          if (!navidromeUrl) return;
          server.middlewares.use("/api/config", (_req, res) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ proxyMode: true, uploadEnabled: false }));
          });
        },
      },
    ],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy: navidromeUrl
        ? {
            "/rest": { target: navidromeUrl, changeOrigin: true },
            "/auth": { target: navidromeUrl, changeOrigin: true },
            "/share": { target: navidromeUrl, changeOrigin: true },
            "/api": { target: navidromeUrl, changeOrigin: true },
          }
        : undefined,
    },
    build: {
      target: "esnext",
      // The stylesheets use CSS nesting; flatten it for browsers that predate
      // it (older TVs and tablets especially).
      cssTarget: ["chrome100", "safari15", "firefox100", "edge100"],
      sourcemap: false,
    },
  };
});
