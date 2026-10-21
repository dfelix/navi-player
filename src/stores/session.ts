// Auth/session state. Holds the active API client and drives the login/re-login
// flow. On an auth error from any request, `reauthRequired` flips so the UI can
// prompt for the password again instead of failing silently.
//
// The server is fixed by deployment configuration (see lib/config.ts), resolved
// once at boot by init().

import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { NavidromeClient } from "@/api/client";
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
  type ServerCredentials,
} from "@/api/credentials";
import { loginNative, loginSubsonic } from "@/api/signIn";
import { ApiError } from "@/api/types";
import { t } from "@/i18n";
import { resolveApiBase } from "@/lib/config";
import { queryClient } from "@/lib/query";
import { clearCoverArtCache } from "@/lib/swCaches";

export const useSessionStore = defineStore("session", () => {
  // The client is a class instance with private state; keep it out of Vue's
  // deep reactivity.
  const client = shallowRef<NavidromeClient | null>(null);
  const reauthRequired = ref(false);
  const username = ref<string | null>(null);
  const isAdmin = ref(false);
  // The API base every request uses, or the reason there isn't one.
  const apiBase = ref<string | null>(null);
  const configError = ref<string | null>(null);
  // False until init() has run, so the UI can hold a splash instead of flashing
  // the login screen at someone who is already signed in.
  const ready = ref(false);

  const isAuthenticated = computed(() => client.value !== null && !reauthRequired.value);

  // Whether the API is served from this page's origin — via the bundled
  // server's proxy, or a reverse proxy routing Navidrome on the same hostname.
  // Media is then CORS-clean, so Web Audio (the equalizer) can read it.
  const apiIsSameOrigin = computed(() => {
    if (!apiBase.value || typeof window === "undefined") return false;
    try {
      return new URL(apiBase.value).origin === window.location.origin;
    } catch {
      return false;
    }
  });

  // Drop everything cached for the current account: library data (playlists,
  // favourites and stats are per user, and their cache keys aren't) and cover
  // art (whose cached URLs carry the Subsonic token).
  function forgetAccountData(): void {
    queryClient.clear();
    void clearCoverArtCache();
  }

  function adopt(creds: ServerCredentials): void {
    // A different account signing in (e.g. after a session expiry) must never
    // see the previous one's cached library.
    if (username.value !== null && username.value !== creds.username) forgetAccountData();
    client.value = new NavidromeClient(creds, {
      onAuthError: () => {
        reauthRequired.value = true;
      },
    });
    username.value = creds.username;
    isAdmin.value = creds.isAdmin ?? false;
    reauthRequired.value = false;
  }

  // Resolve the configured server and restore a previous session, if any. Must
  // run after the server config has loaded, which decides whether the API is
  // proxied.
  function init(proxyMode: boolean): void {
    const base = resolveApiBase(proxyMode);
    if (base.ok) {
      apiBase.value = base.url;
      configError.value = null;
      const creds = loadCredentials(base.url);
      if (creds) adopt(creds);
    } else {
      apiBase.value = null;
      configError.value = base.error;
    }
    ready.value = true;
  }

  async function login(user: string, password: string): Promise<void> {
    const base = apiBase.value;
    if (!base) throw new ApiError(configError.value ?? t("errors.notConfigured"));
    if (!user || !password) throw new ApiError(t("errors.enterCredentials"));

    let creds: ServerCredentials;
    try {
      // Native login gives a JWT as well as Subsonic credentials, which unlocks
      // play statistics, playlist covers, shares and uploads.
      creds = await loginNative(base, user, password);
    } catch (e) {
      // A wrong password is final. Anything else (the native endpoint not
      // routed by a reverse proxy, an older server) falls back to Subsonic
      // token auth.
      if (e instanceof ApiError && e.isAuthError) throw e;
      creds = await loginSubsonic(base, user, password);
    }

    saveCredentials(creds);
    adopt(creds);
  }

  function logout(): void {
    clearCredentials();
    forgetAccountData();
    client.value = null;
    username.value = null;
    isAdmin.value = false;
    reauthRequired.value = false;
  }

  // For code that only runs inside the authenticated shell.
  function requireClient(): NavidromeClient {
    if (!client.value) throw new Error("No active session");
    return client.value;
  }

  return {
    client,
    reauthRequired,
    username,
    isAdmin,
    apiBase,
    configError,
    ready,
    isAuthenticated,
    apiIsSameOrigin,
    init,
    login,
    logout,
    requireClient,
  };
});
