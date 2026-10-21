// Starting playback of things whose songs aren't loaded yet: an album or
// artist from a card or menu, Surprise Me, radios.

import type { Song } from "@/api/types";
import { t } from "@/i18n";
import { buildSurpriseQueue } from "@/lib/recommendations";
import { shuffled } from "@/lib/shuffle";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";

const client = () => useSessionStore().client;

function play(songs: Song[], shuffle = false): void {
  usePlayerStore().playNow(shuffle ? shuffled(songs) : songs, 0);
}

export async function playAlbum(albumId: string, shuffle = false): Promise<void> {
  const c = client();
  if (c) play((await c.getAlbum(albumId)).song, shuffle);
}

export async function queueAlbum(albumId: string, position: "next" | "end"): Promise<void> {
  const c = client();
  if (!c) return;
  const { song } = await c.getAlbum(albumId);
  const player = usePlayerStore();
  if (position === "next") player.playNext(song);
  else player.addToQueue(song);
}

// Every album of the artist, in the order Navidrome lists them.
export async function playArtist(artistId: string, shuffle = false): Promise<void> {
  const c = client();
  if (!c) return;
  const { albums } = await c.getArtist(artistId);
  const songs: Song[] = [];
  for (const album of albums) songs.push(...(await c.getAlbum(album.id)).song);
  play(songs, shuffle);
}

// One random track and the tracks similar to it: a coherent start rather than
// a random jumble (Infinite radio carries it on). False when the library is
// empty.
export async function surpriseMe(): Promise<boolean> {
  const c = client();
  const [seed] = (await c?.getRandomSongs(1)) ?? [];
  if (!c || !seed) return false;
  play(buildSurpriseQueue(seed, await c.getSimilarSongs(seed.id, 25)));
  return true;
}

// Navidrome's mix for a song, album, artist or genre. False when it had none.
export async function playInstantMix(
  id: string,
  kind: "song" | "album" | "artist" | "genre",
): Promise<boolean> {
  const songs = (await client()?.getInstantMix(id, kind, 50)) ?? [];
  if (songs.length > 0) play(songs);
  return songs.length > 0;
}

// "<Artist> Radio" (lib/artistRadio). When nothing was found it says so.
export async function playArtistRadio(artist: { id: string; name: string }): Promise<boolean> {
  const started = await usePlayerStore().startArtistRadio(artist);
  if (!started) useUiStore().showToast(t("artist.radioFailed", { name: artist.name }));
  return started;
}
