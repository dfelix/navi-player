// The shared styles load before any component's, so a component's own rules
// win when specificity is equal.
import "./styles/global.css";
import "./styles/pages.css";
import "./styles/dialog.css";

import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { installPwaListeners } from "./composables/usePwaInstall";
import { i18n } from "./i18n";
import { APP_NAME, APP_TAGLINE } from "./lib/branding";
import { queryClient } from "./lib/query";
import { router } from "./router";
import { useServerConfigStore } from "./stores/serverConfig";
import { useSessionStore } from "./stores/session";
import { applyLanguageSetting, persistSettingsOnChange } from "./stores/settings";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(VueQueryPlugin, { queryClient });
app.use(i18n);
persistSettingsOnChange();
applyLanguageSetting();

// Find out whether the bundled server is proxying Navidrome on this origin,
// then resolve the configured server and restore a prior session. The player
// store restores the queue once the session's client appears.
const serverConfig = useServerConfigStore();
void serverConfig.load().then(() => useSessionStore().init(serverConfig.proxyMode));

// Must be early, or the browser's install prompt event is missed.
installPwaListeners();

// Offline support, in built versions only (in development it would serve stale
// files over Vite's). Without it the app simply needs the network.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener(
    "load",
    () => void navigator.serviceWorker.register("/sw.js").catch(() => null),
    {
      once: true,
    },
  );
}

app.mount("#root");

// For whoever opens the developer console. Nothing is tracked or reported.
console.info(`%c${APP_NAME}%c · ${APP_TAGLINE}`, "color:#14b8a6;font-weight:600", "color:#a7a7a7");
