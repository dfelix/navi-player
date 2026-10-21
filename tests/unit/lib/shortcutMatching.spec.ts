import { DEFAULT_SHORTCUTS } from "@/lib/settingsSchema";
import { keyFromEvent, shortcutActionForEvent } from "@/lib/shortcutMatching";

function keyboard(
  key: string,
  mods: Partial<Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "target">> = {},
) {
  return {
    key,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    target: null,
    ...mods,
  };
}

describe("shortcut matching", () => {
  it("names combos in a stable modifier order", () => {
    expect(keyFromEvent(keyboard(" ", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+Space");
  });

  it("maps the default seek shortcut outside text fields", () => {
    expect(shortcutActionForEvent(keyboard("ArrowLeft"), DEFAULT_SHORTCUTS)).toBe("seekBackward");
  });

  it("doesn't turn the macOS line-start command into 'previous track'", () => {
    expect(
      shortcutActionForEvent(keyboard("ArrowLeft", { metaKey: true }), DEFAULT_SHORTCUTS),
    ).toBeNull();
  });

  it("ignores keys typed into a text field", () => {
    const target = document.createElement("input");
    expect(shortcutActionForEvent(keyboard("ArrowLeft", { target }), DEFAULT_SHORTCUTS)).toBeNull();
  });
});
