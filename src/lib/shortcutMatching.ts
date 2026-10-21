// Matching key presses to the rebindable shortcuts, apart from the app so it
// can be tested on its own.

import type { ShortcutAction } from "@/lib/settingsSchema";

type KeyPress = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

const MODIFIERS: [keyof KeyPress, string][] = [
  ["ctrlKey", "Ctrl"],
  ["altKey", "Alt"],
  ["shiftKey", "Shift"],
  ["metaKey", "Meta"],
];

// How a key press is written in the settings: "Ctrl+Shift+k", "Space".
export function keyFromEvent(press: KeyPress): string {
  const held = MODIFIERS.filter(([flag]) => press[flag]).map(([, name]) => name);
  return [...held, press.key === " " ? "Space" : press.key].join("+");
}

// Keys typed into a field belong to the field.
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function shortcutActionForEvent(
  press: KeyPress & Pick<KeyboardEvent, "target">,
  bindings: Record<ShortcutAction, string>,
): ShortcutAction | null {
  if (isTypingTarget(press.target)) return null;
  const combo = keyFromEvent(press);
  const match = Object.entries(bindings).find(([, keys]) => keys === combo);
  return (match?.[0] as ShortcutAction | undefined) ?? null;
}
