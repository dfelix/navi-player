// Tells the service worker how much cover art it may keep (Settings →
// Performance). Workers can't read localStorage, so the value is sent at start
// and whenever it changes.

import { watch } from "vue";
import { log } from "@/lib/log";
import { useSettingsStore } from "@/stores/settings";

async function tellWorker(megabytes: number): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  try {
    const { active } = await navigator.serviceWorker.ready;
    // A worker still installing has no `active`; the next change or start sends it.
    active?.postMessage({ type: "art-budget", megabytes });
    log.debug("art-cache", `budget ${megabytes}MB sent to the worker`);
  } catch (err) {
    log.debug("art-cache", "worker unavailable", err);
  }
}

export function useArtCacheBudget(): void {
  const settings = useSettingsStore();
  watch(
    () => settings.power.coverArtCacheMB,
    (mb) => void tellWorker(mb),
    { immediate: true },
  );
}
