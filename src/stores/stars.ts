// Favourites. Navidrome holds them, so every device agrees; this store makes a
// heart change show at once, before the server and the refreshed lists have
// caught up.
//
// The local answer only lasts a few seconds after the change is saved, then
// the server's answer is used again. If it lasted longer, a favourite changed
// on another device would stay wrong here.

import { defineStore } from "pinia";
import { reactive, watch } from "vue";
import { invalidateStarSensitive } from "@/lib/query";
import { useSessionStore } from "./session";

export type StarKind = "song" | "album" | "artist";

// Long enough for the refreshed lists to arrive and repaint.
const LOCAL_ANSWER_MS = 4_000;

export const useStarsStore = defineStore("stars", () => {
  const session = useSessionStore();
  const pending = reactive(new Map<string, boolean>());
  const expiry = new Map<string, ReturnType<typeof setTimeout>>();

  function forget(id: string): void {
    clearTimeout(expiry.get(id));
    expiry.delete(id);
    pending.delete(id);
  }

  function forgetLater(id: string): void {
    clearTimeout(expiry.get(id));
    expiry.set(
      id,
      setTimeout(() => forget(id), LOCAL_ANSWER_MS),
    );
  }

  function clear(): void {
    [...pending.keys()].forEach(forget);
  }

  // Ids belong to one account; a new sign-in starts clean.
  watch(() => session.client, clear);

  function isStarred(id: string, fromServer: string | boolean | undefined): boolean {
    return pending.get(id) ?? !!fromServer;
  }

  async function toggle(
    id: string,
    fromServer: string | boolean | undefined,
    kind: StarKind = "song",
  ): Promise<void> {
    const client = session.client;
    if (!client) return;
    const starred = !isStarred(id, fromServer);
    pending.set(id, starred);
    try {
      await (starred ? client.star(id, kind) : client.unstar(id, kind));
      invalidateStarSensitive();
      forgetLater(id);
    } catch {
      forget(id); // didn't save: show what the server has
    }
  }

  return { isStarred, toggle, clear };
});
