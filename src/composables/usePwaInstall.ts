// "Install app" (Settings → Appearance). Chromium browsers announce that the
// app can be installed with a `beforeinstallprompt` event, which is kept here
// so the button can show the browser's own install dialog. Safari on iPhone
// and iPad has no such event, so Settings explains the Share-menu way.
//
// The event can fire before any component exists, so listening starts in
// main.ts (installPwaListeners) and the state lives in this module.

import { computed, ref } from "vue";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const offer = ref<InstallPrompt | null>(null);

const runningInstalled = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true); // iOS

const installed = ref(runningInstalled());

export function installPwaListeners(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // no browser banner: Settings has the button
    offer.value = event as InstallPrompt;
  });
  window.addEventListener("appinstalled", () => {
    offer.value = null;
    installed.value = true;
  });
}

// iPadOS says it's a Mac; touch gives it away.
function onAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
}

export function usePwaInstall() {
  async function prompt(): Promise<void> {
    const pending = offer.value;
    if (!pending) return;
    await pending.prompt();
    if ((await pending.userChoice).outcome === "accepted") offer.value = null;
  }
  return {
    canPrompt: computed(() => offer.value !== null),
    isInstalled: installed,
    isIos: onAppleMobile(),
    prompt,
  };
}
