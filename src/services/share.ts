// "Share" for albums, playlists, artists and songs: the system share sheet
// where there is one (phones, Safari), otherwise the link goes to the
// clipboard with a confirmation.
//
// Links point at this app's own pages (/album/<id>…). With link previews on
// (server/previews.ts), chat apps show a card for them; people who open one
// sign in and land on that page.

import { t } from "@/i18n";
import { useUiStore } from "@/stores/ui";

export function absoluteUrl(path: string): string {
  return new URL(path, window.location.origin).href;
}

export async function shareLink(path: string, title: string): Promise<void> {
  const url = absoluteUrl(path);
  const ui = useUiStore();
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return;
    } catch (err) {
      // Closing the sheet is a choice, not a failure: don't copy behind it.
      if ((err as DOMException)?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    ui.showToast(t("share.copied"));
  } catch {
    // No clipboard access (plain HTTP, permissions): show the link to copy.
    ui.showToast(url);
  }
}
