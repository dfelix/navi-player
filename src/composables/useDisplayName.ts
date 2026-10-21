import { computed } from "vue";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";

// The name to greet with: a user-set display name, else the server username.
export function useDisplayName() {
  const settings = useSettingsStore();
  const session = useSessionStore();
  return computed(() => settings.profile.displayName.trim() || session.username || "");
}
