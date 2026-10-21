import { nearestAhead } from "@/composables/useSpatialNav";

const box = (x: number, y: number, w = 10, h = 10) => ({ x, y, width: w, height: h }) as DOMRect;
const named = (name: string) => ({ name }) as unknown as HTMLElement;
const nameOf = (el: HTMLElement | null) => (el as unknown as { name: string } | null)?.name;

describe("nearestAhead", () => {
  const from = box(100, 100);
  const options = [
    { el: named("right, in line"), box: box(130, 100) },
    { el: named("right, closer but below"), box: box(115, 125) },
    { el: named("left"), box: box(60, 100) },
  ];

  it("prefers the neighbour in line over a nearer one off to the side", () => {
    expect(nameOf(nearestAhead(from, [1, 0], options))).toBe("right, in line");
  });

  it("only looks the way the arrow points", () => {
    expect(nameOf(nearestAhead(from, [-1, 0], options))).toBe("left");
    expect(nameOf(nearestAhead(from, [0, 1], options))).toBe("right, closer but below");
    expect(nearestAhead(from, [0, -1], options)).toBeNull();
  });
});
