// Arrow-key focus movement, for TV remotes and keyboards: an arrow moves
// focus to the nearest control in that direction, so every page works
// without a mouse.
//
// The arrows also seek and change volume (useShortcuts). That still happens
// when nothing is focused, in the player bar and on sliders; anywhere else,
// with something focused, the arrows move focus. This runs before the
// shortcut handler and only stops the key when it actually moved focus.

import { onBeforeUnmount, onMounted } from "vue";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

// Where arrows keep their media meaning.
const MEDIA_CONTROLS = ".np-bar, [role='slider'], .slider";

// Unit vectors for each arrow.
const DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function shown(el: HTMLElement): boolean {
  if (el.hidden) return false;
  const box = el.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return false;
  const style = getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

const middle = (box: DOMRect): [number, number] => [box.x + box.width / 2, box.y + box.height / 2];

// The closest control ahead of `from`. Distance off the line of travel counts
// double, so focus goes to the neighbour you'd point at, not a nearer one
// diagonally across.
export function nearestAhead(
  from: DOMRect,
  [dx, dy]: [number, number],
  options: Iterable<{ el: HTMLElement; box: DOMRect }>,
): HTMLElement | null {
  const [x, y] = middle(from);
  let best: HTMLElement | null = null;
  let bestCost = Infinity;
  for (const { el, box } of options) {
    const [tx, ty] = middle(box);
    const ahead = (tx - x) * dx + (ty - y) * dy;
    if (ahead <= 1) continue;
    const aside = Math.abs((tx - x) * dy - (ty - y) * dx);
    const cost = ahead + 2 * aside;
    if (cost < bestCost) [best, bestCost] = [el, cost];
  }
  return best;
}

function isTyping(el: HTMLElement): boolean {
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function useSpatialNav(): void {
  function onKey(event: KeyboardEvent): void {
    const direction = DIRECTIONS[event.key];
    if (!direction || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const focused = document.activeElement as HTMLElement | null;
    if (!focused || focused === document.body) return; // media keys' turn
    if (focused.closest(MEDIA_CONTROLS) || isTyping(focused)) return;

    const options = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((el) => el !== focused && shown(el))
      .map((el) => ({ el, box: el.getBoundingClientRect() }));
    const target = nearestAhead(focused.getBoundingClientRect(), direction, options);
    if (!target) return; // at the edge: let the key do whatever else it does

    event.preventDefault();
    event.stopImmediatePropagation();
    target.focus();
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  // Capture phase, so this sees the key before the shortcut handler does.
  onMounted(() => window.addEventListener("keydown", onKey, true));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKey, true));
}
