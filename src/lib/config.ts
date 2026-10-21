// Deployment configuration: which Navidrome server this build talks to.
//
// NaviPlayer is bound to exactly one Navidrome server, chosen by whoever deploys
// it — users never type a server URL. The address comes from VITE_NAVIDROME_URL,
// which Vite inlines at build time (so changing it means rebuilding a static
// deployment). When the app is served by the bundled NaviPlayer server, that
// server reads the same variable at runtime and proxies the API on this origin;
// see resolveApiBase().
//
// The URL is public configuration, never a secret: it ends up in the JS bundle.

import { t } from "@/i18n";
import { NAVIDROME_URL_ENV } from "@/lib/env";

export type NavidromeUrlResult = { ok: true; url: string } | { ok: false; error: string };

// Validate and normalise a configured Navidrome base URL.
//
// Accepts a path prefix (Navidrome's ND_BASEURL, e.g. https://host/music) and
// strips trailing slashes so endpoint joins stay predictable. Rejects anything
// that would make every request fail in a confusing way later: a missing scheme,
// embedded credentials, a query string or fragment, or an http:// server behind
// an https:// page (the browser would block every request as mixed content).
export function parseNavidromeUrl(
  raw: string | undefined,
  pageProtocol?: string,
): NavidromeUrlResult {
  const value = (raw ?? "").trim();
  if (!value) {
    return {
      ok: false,
      error: t("config.notSet"),
    };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: t("config.invalid", { value }) };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      error: t("config.scheme", { protocol: url.protocol }),
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      error: t("config.credentials"),
    };
  }
  if (url.search || url.hash) {
    return {
      ok: false,
      error: t("config.query"),
    };
  }
  if (pageProtocol === "https:" && url.protocol === "http:") {
    return {
      ok: false,
      error: t("config.mixedContent"),
    };
  }
  const path = url.pathname.replace(/\/+$/, "");
  return { ok: true, url: `${url.origin}${path}` };
}

// The value baked into this build.
export const CONFIGURED_NAVIDROME_URL: string | undefined = NAVIDROME_URL_ENV;

// Where every Navidrome request goes.
//
// With the bundled server proxying (proxyMode), the API lives on this origin and
// the browser never needs CORS. Otherwise the build-time URL is used directly.
export function resolveApiBase(proxyMode: boolean): NavidromeUrlResult {
  if (proxyMode && typeof window !== "undefined") {
    return { ok: true, url: window.location.origin };
  }
  return parseNavidromeUrl(
    CONFIGURED_NAVIDROME_URL,
    typeof window !== "undefined" ? window.location.protocol : undefined,
  );
}
