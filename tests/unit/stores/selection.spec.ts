// Selecting tracks with Ctrl/⌘ and Shift, as in a file manager.
import { createPinia, setActivePinia } from "pinia";
import type { Song } from "@/api/types";
import { useSelectionStore } from "@/stores/selection";

const list = Array.from({ length: 8 }, (_, n) => ({ id: `s${n}`, title: `Song ${n}` }) as Song);
const plain = { ctrlKey: false, metaKey: false, shiftKey: false };
const ctrl = { ...plain, ctrlKey: true };
const cmd = { ...plain, metaKey: true };
const shift = { ...plain, shiftKey: true };

let selection: ReturnType<typeof useSelectionStore>;
const click = (row: number, keys = plain, listName = "list") =>
  selection.handleRowClick(listName, row, list, keys);
const chosen = () => selection.selectedSongs(list).map((song) => song.id);

beforeEach(() => {
  setActivePinia(createPinia());
  selection = useSelectionStore();
});

describe("selection", () => {
  it("leaves plain clicks to the row (to play it)", () => {
    expect(click(3)).toBe(false);
    expect(selection.count).toBe(0);
  });

  it("adds and removes single tracks with Ctrl or ⌘, ending empty", () => {
    expect(click(3, ctrl)).toBe(true);
    click(6, cmd);
    expect(chosen()).toEqual(["s3", "s6"]);
    click(3, ctrl);
    click(6, ctrl);
    expect(selection.count).toBe(0);
    expect(selection.listId).toBeNull();
  });

  it("selects a Shift range from where it started, in either direction", () => {
    click(2, ctrl);
    click(5, shift);
    expect(chosen()).toEqual(["s2", "s3", "s4", "s5"]);
    // A new range from the same start replaces the old one.
    click(0, shift);
    expect(chosen()).toEqual(["s0", "s1", "s2"]);
  });

  it("starts a selection with Shift too", () => {
    expect(click(4, shift)).toBe(true);
    expect(chosen()).toEqual(["s4"]);
  });

  it("keeps one list's selection at a time", () => {
    click(0, ctrl, "album");
    click(1, ctrl, "album");
    click(5, ctrl, "playlist");
    expect(selection.listId).toBe("playlist");
    expect(chosen()).toEqual(["s5"]);
    expect(selection.isSelected("album", "s0")).toBe(false);
  });

  it("gives the songs in list order, whatever order they were clicked", () => {
    [7, 2, 5].forEach((row) => click(row, ctrl));
    expect(chosen()).toEqual(["s2", "s5", "s7"]);
  });

  it("selects everything, and clears", () => {
    selection.selectAll("list", list);
    expect(selection.count).toBe(list.length);
    selection.clear();
    expect(chosen()).toEqual([]);
  });
});
