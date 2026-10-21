import { flushPromises, mount } from "@vue/test-utils";
import type { Song } from "@/api/types";
import TrackRow from "@/components/library/TrackRow.vue";
import { saveCredentials } from "@/api/credentials";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { appPlugins, mockFetch, subsonicOk } from "../../helpers";

jest.mock("@/lib/env", () => ({ NAVIDROME_URL_ENV: "https://music.example.com" }));

const songs = [
  { id: "a", title: "Alpha", artist: "X", duration: 61, suffix: "mp3" },
  { id: "b", title: "Beta", artist: "Y", duration: 125, suffix: "mp3", starred: "2024-01-01" },
] as Song[];

async function mountRow(index: number) {
  const { calls } = mockFetch(() => subsonicOk());
  const plugins = await appPlugins();
  saveCredentials({
    serverUrl: "https://music.example.com",
    username: "alice",
    authMethod: "subsonic",
    subsonicSalt: "s",
    subsonicToken: "t",
    savedAt: 0,
  });
  useSessionStore().init(false);
  const wrapper = mount(TrackRow, {
    props: { song: songs[index]!, number: index + 1, context: songs, contextIndex: index },
    global: { plugins: [...plugins] },
  });
  return { wrapper, calls };
}

describe("TrackRow", () => {
  it("shows the track's number, title, artist and length", async () => {
    const { wrapper } = await mountRow(1);
    expect(wrapper.text()).toContain("2");
    expect(wrapper.text()).toContain("Beta");
    expect(wrapper.text()).toContain("Y");
    expect(wrapper.text()).toContain("2:05");
  });

  it("plays within its list on double-click", async () => {
    const { wrapper } = await mountRow(1);
    await wrapper.get(".track-row").trigger("dblclick");
    const player = usePlayerStore();
    expect(player.state.queue.map((s) => s.id)).toEqual(["a", "b"]);
    expect(player.current?.id).toBe("b");
  });

  it("stars a track on the server, optimistically", async () => {
    const { wrapper, calls } = await mountRow(0);
    const heart = wrapper.get('button[aria-label="Favourite"]');
    await heart.trigger("click");
    expect(wrapper.find('button[aria-label="Remove favourite"]').exists()).toBe(true);
    await flushPromises();
    expect(
      calls.some((u) => u.pathname === "/rest/star.view" && u.searchParams.get("id") === "a"),
    ).toBe(true);
  });
});
