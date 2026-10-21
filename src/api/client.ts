// The app's view of one Navidrome account: every read and write the UI makes,
// as typed methods. Requests themselves (auth, envelopes, errors, the JWT) are
// handled by ./transport; the Stats page's calculations live in
// ./listeningStats.
//
// One instance per signed-in session. When Navidrome rejects the credentials,
// `onAuthError` fires so the app can ask for the password again instead of
// failing quietly.

import { t } from "@/i18n";
import type { ServerCredentials } from "./credentials";
import { libraryStats, userStats, type LibraryStats, type UserStats } from "./listeningStats";
import { Transport, type Params } from "./transport";
import {
  ApiError,
  type Album,
  type AlbumWithSongs,
  type Artist,
  type ArtistSummary,
  type Genre,
  type Playlist,
  type PlaylistWithSongs,
  type SearchResult,
  type Song,
  type StructuredLyrics,
} from "./types";

export type { LibraryStats, UserStats } from "./listeningStats";

export type AlbumListType =
  | "newest"
  | "recent"
  | "frequent"
  | "random"
  | "starred"
  | "alphabeticalByName"
  | "alphabeticalByArtist"
  | "byYear"
  | "byGenre";

export interface ClientOptions {
  onAuthError?: (creds: ServerCredentials) => void;
}

type Favourites = { artist: ArtistSummary[]; album: Album[]; song: Song[] };
type StarKind = "song" | "album" | "artist";

// Which parameter star/unstar takes for each kind of item.
const STAR_PARAM: Record<StarKind, string> = { song: "id", album: "albumId", artist: "artistId" };

export class NavidromeClient {
  readonly transport: Transport;

  constructor(creds: ServerCredentials, opts: ClientOptions = {}) {
    this.transport = new Transport(creds, () => opts.onAuthError?.(creds));
  }

  private get creds(): ServerCredentials {
    return this.transport.creds;
  }

  private call<T>(endpoint: string, params?: Params): Promise<T> {
    return this.transport.subsonic<T>(endpoint, params);
  }

  get serverUrl(): string {
    return this.creds.serverUrl;
  }

  get username(): string {
    return this.creds.username;
  }

  // ---- URLs the browser loads directly ----

  buildUrl(endpoint: string, params: Record<string, string | number | undefined> = {}): string {
    return this.transport.subsonicUrl(endpoint, params);
  }

  streamUrl(id: string, maxBitRate?: number, format?: string): string {
    return this.transport.subsonicUrl(
      "stream.view",
      { id, maxBitRate: maxBitRate || undefined, format },
      { json: false },
    );
  }

  coverArtUrl(id: string | undefined, size?: number): string {
    return id ? this.buildUrl("getCoverArt.view", { id, size: size || undefined }) : "";
  }

  // The original file for a song id; a ZIP of the originals for an album or
  // playlist id.
  downloadUrl(id: string): string {
    return this.transport.subsonicUrl("download.view", { id }, { json: false });
  }

  // ---- Server ----

  async ping(): Promise<boolean> {
    await this.call("ping.view");
    return true;
  }

  async getServerInfo(): Promise<{ name?: string; version?: string } | null> {
    try {
      const pong = await this.call<{ type?: string; serverVersion?: string; version?: string }>(
        "ping.view",
      );
      return { name: pong.type, version: pong.serverVersion ?? pong.version };
    } catch {
      return null;
    }
  }

  // ---- Artists, albums, songs ----

  async getArtists(): Promise<ArtistSummary[]> {
    const r = await this.call<{ artists?: { index?: { artist?: ArtistSummary[] }[] } }>(
      "getArtists.view",
    );
    return (r.artists?.index ?? []).flatMap((group) => group.artist ?? []);
  }

  async getArtist(id: string): Promise<Artist> {
    const r = await this.call<{ artist: Artist & { album?: Album[] } }>("getArtist.view", { id });
    const { album, ...artist } = r.artist;
    return { ...artist, albums: album ?? [] };
  }

  // Biography and similar artists. Navidrome gets these from its metadata
  // agents (Last.fm); without one they're empty.
  async getArtistInfo(
    id: string,
  ): Promise<{ biography?: string; similarArtist?: ArtistSummary[] }> {
    const r = await this.call<{
      artistInfo2?: { biography?: string; similarArtist?: ArtistSummary[] };
    }>("getArtistInfo2.view", { id, count: 8 });
    return r.artistInfo2 ?? {};
  }

  async getAlbum(id: string): Promise<AlbumWithSongs> {
    const r = await this.call<{ album: AlbumWithSongs }>("getAlbum.view", { id });
    return { ...r.album, song: r.album.song ?? [] };
  }

  async getAlbumList(
    type: AlbumListType,
    opts: {
      size?: number;
      offset?: number;
      genre?: string;
      fromYear?: number;
      toYear?: number;
    } = {},
  ): Promise<Album[]> {
    const r = await this.call<{ albumList2?: { album?: Album[] } }>("getAlbumList2.view", {
      type,
      size: opts.size ?? 50,
      offset: opts.offset ?? 0,
      genre: opts.genre,
      fromYear: opts.fromYear,
      toYear: opts.toYear,
    });
    return r.albumList2?.album ?? [];
  }

  async getSong(id: string): Promise<Song> {
    return (await this.call<{ song: Song }>("getSong.view", { id })).song;
  }

  async getRandomSongs(size = 50, genre?: string): Promise<Song[]> {
    const r = await this.call<{ randomSongs?: { song?: Song[] } }>("getRandomSongs.view", {
      size,
      genre,
    });
    return r.randomSongs?.song ?? [];
  }

  // An artist's most popular tracks, by name (Last.fm data in Navidrome).
  async getTopSongs(artist: string, count = 50): Promise<Song[]> {
    const r = await this.call<{ topSongs?: { song?: Song[] } }>("getTopSongs.view", {
      artist,
      count,
    });
    return r.topSongs?.song ?? [];
  }

  // Songs like a song, album or artist. Uses the OpenSubsonic v2 endpoint, and
  // the original one when v2 is missing or comes back empty. Never throws:
  // "nothing similar" is a normal answer.
  async getSimilarSongs(id: string, count = 50): Promise<Song[]> {
    const v2 = await this.call<{ similarSongs2?: { song?: Song[] } }>("getSimilarSongs2.view", {
      id,
      count,
    }).catch(() => null);
    const songs = v2?.similarSongs2?.song ?? [];
    if (songs.length > 0) return songs;
    const v1 = await this.call<{ similarSongs?: { song?: Song[] } }>("getSimilarSongs.view", {
      id,
      count,
    }).catch(() => null);
    return v1?.similarSongs?.song ?? [];
  }

  // A mix seeded from any item. Similar-songs takes a track, so for an album,
  // genre or artist a representative track is looked up first.
  async getInstantMix(
    id: string,
    kind: "song" | "album" | "artist" | "genre" = "song",
    count = 50,
  ): Promise<Song[]> {
    try {
      const seed = kind === "song" ? id : (await this.representativeSong(id, kind))?.id;
      return seed ? await this.getSimilarSongs(seed, count) : [];
    } catch {
      return [];
    }
  }

  private async representativeSong(
    id: string,
    kind: "album" | "artist" | "genre",
  ): Promise<Song | undefined> {
    if (kind === "album") return (await this.getAlbum(id)).song[0];
    if (kind === "genre") return (await this.getSongsByGenre(id, 1))[0];
    const first = (await this.getArtist(id)).albums[0];
    return first ? (await this.getAlbum(first.id)).song[0] : undefined;
  }

  // ---- Genres ----

  async getGenres(): Promise<Genre[]> {
    const r = await this.call<{ genres?: { genre?: Genre[] } }>("getGenres.view");
    return r.genres?.genre ?? [];
  }

  async getSongsByGenre(genre: string, count = 100, offset = 0): Promise<Song[]> {
    const r = await this.call<{ songsByGenre?: { song?: Song[] } }>("getSongsByGenre.view", {
      genre,
      count,
      offset,
    });
    return r.songsByGenre?.song ?? [];
  }

  // ---- Stats ----

  getLibraryStats(): Promise<LibraryStats> {
    return libraryStats(this);
  }

  getUserStats(): Promise<UserStats> {
    return userStats(this);
  }

  // ---- Favourites, ratings, plays ----

  async getStarred(): Promise<Favourites> {
    const r = await this.call<{ starred2?: Partial<Favourites> }>("getStarred2.view");
    const s = r.starred2 ?? {};
    return { artist: s.artist ?? [], album: s.album ?? [], song: s.song ?? [] };
  }

  async star(id: string, kind: StarKind = "song"): Promise<void> {
    await this.call("star.view", { [STAR_PARAM[kind]]: id });
  }

  async unstar(id: string, kind: StarKind = "song"): Promise<void> {
    await this.call("unstar.view", { [STAR_PARAM[kind]]: id });
  }

  async setRating(id: string, rating: number): Promise<void> {
    await this.call("setRating.view", { id, rating });
  }

  // `submission: false` is "now playing"; true records a play.
  async scrobble(id: string, submission: boolean, time?: number): Promise<void> {
    await this.call("scrobble.view", { id, submission, time });
  }

  // ---- Search ----

  async search(
    query: string,
    opts: { artistCount?: number; albumCount?: number; songCount?: number } = {},
  ): Promise<SearchResult> {
    const r = await this.call<{ searchResult3?: Partial<SearchResult> }>("search3.view", {
      query,
      artistCount: opts.artistCount ?? 20,
      albumCount: opts.albumCount ?? 20,
      songCount: opts.songCount ?? 50,
    });
    const found = r.searchResult3 ?? {};
    return { artist: found.artist ?? [], album: found.album ?? [], song: found.song ?? [] };
  }

  // ---- Playlists ----

  async getPlaylists(): Promise<Playlist[]> {
    const r = await this.call<{ playlists?: { playlist?: Playlist[] } }>("getPlaylists.view");
    return r.playlists?.playlist ?? [];
  }

  async getPlaylist(id: string): Promise<PlaylistWithSongs> {
    const r = await this.call<{ playlist: PlaylistWithSongs }>("getPlaylist.view", { id });
    return { ...r.playlist, entry: r.playlist.entry ?? [] };
  }

  // Create a playlist and return its id. New playlists are private unless asked
  // otherwise: Navidrome's own default can be public, so visibility is always
  // set explicitly afterwards.
  async createPlaylist(
    name: string,
    songIds: string[] = [],
    isPublic = false,
  ): Promise<string | undefined> {
    const r = await this.call<{ playlist?: { id?: string } }>("createPlaylist.view", {
      name,
      songId: songIds,
    });
    const id = r.playlist?.id ?? (await this.findNewestOwnPlaylist(name));
    if (id) await this.updatePlaylist(id, { public: isPublic }).catch(() => undefined);
    return id;
  }

  // Some servers confirm a creation without returning the playlist. The newest
  // of ours with that name is the one just made.
  private async findNewestOwnPlaylist(name: string): Promise<string | undefined> {
    try {
      const candidates = (await this.getPlaylists()).filter(
        (p) => p.name === name && (!p.owner || p.owner === this.username),
      );
      candidates.sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""));
      return candidates[0]?.id;
    } catch {
      return undefined;
    }
  }

  async setPlaylistVisibility(id: string, isPublic: boolean): Promise<void> {
    await this.updatePlaylist(id, { public: isPublic });
  }

  async deletePlaylist(id: string): Promise<void> {
    await this.call("deletePlaylist.view", { id });
  }

  // Rename, describe, change visibility, add songs, or remove songs by
  // position. Reordering is overwritePlaylist.
  async updatePlaylist(
    id: string,
    changes: {
      name?: string;
      comment?: string;
      public?: boolean;
      songIdToAdd?: string[];
      songIndexToRemove?: number[];
    },
  ): Promise<void> {
    await this.call("updatePlaylist.view", {
      playlistId: id,
      name: changes.name,
      comment: changes.comment,
      public: changes.public,
      songIdToAdd: changes.songIdToAdd ?? [],
      songIndexToRemove: changes.songIndexToRemove ?? [],
    });
  }

  // Replace a playlist's contents with `songIds`, in that order. Subsonic can't
  // reorder, so every entry is removed (last first, so positions stay valid)
  // and the new order added.
  async overwritePlaylist(id: string, songIds: string[], currentCount: number): Promise<void> {
    if (currentCount > 0) {
      const positions = [...Array(currentCount).keys()].reverse();
      await this.updatePlaylist(id, { songIndexToRemove: positions });
    }
    if (songIds.length > 0) await this.updatePlaylist(id, { songIdToAdd: songIds });
  }

  // ---- Lyrics ----

  // Structured (often synced) lyrics by id, or plain lyrics by artist and
  // title, whichever the server has. Both are asked at once when the artist
  // and title are known: most tracks have neither, and the caller then tries
  // LRCLIB, so a miss should cost one round trip, not two.
  async getLyrics(
    id: string,
    hints?: { artist?: string; title?: string },
  ): Promise<StructuredLyrics[]> {
    const plainByName = (artist?: string, title?: string): Promise<string | undefined> =>
      artist && title
        ? this.call<{ lyrics?: { value?: string } }>("getLyrics.view", { artist, title })
            .then((r) => r.lyrics?.value)
            .catch(() => undefined)
        : Promise.resolve(undefined);

    const known = !!(hints?.artist && hints?.title);
    const [structured, plainEarly] = await Promise.all([
      this.call<{ lyricsList?: { structuredLyrics?: StructuredLyrics[] } }>(
        "getLyricsBySongId.view",
        { id },
      )
        .then((r) => r.lyricsList?.structuredLyrics ?? [])
        .catch((): StructuredLyrics[] => []),
      known ? plainByName(hints?.artist, hints?.title) : Promise.resolve(undefined),
    ]);
    if (structured.length > 0) return structured;

    // Without hints, the song is only looked up once it's clear it's needed.
    const plain = known
      ? plainEarly
      : await this.getSong(id)
          .then((song) => plainByName(song.artist, song.title))
          .catch(() => undefined);
    if (!plain) return [];
    return [{ synced: false, line: plain.split("\n").map((value) => ({ value })) }];
  }

  // ---- For NaviPlayer's own server ----

  // Lets NaviPlayer's server act for this user against Navidrome (uploads,
  // ZIP downloads): the JWT when there is one, the Subsonic token otherwise.
  getServerAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "x-nd-subsonic-u": this.creds.username,
      "x-nd-subsonic-t": this.creds.subsonicToken,
      "x-nd-subsonic-s": this.creds.subsonicSalt,
    };
    if (this.creds.jwt) headers["x-nd-authorization"] = `Bearer ${this.creds.jwt}`;
    return headers;
  }

  // The Subsonic credentials alone, for requests that carry them in a form body.
  get subsonicAuth(): { u: string; t: string; s: string } {
    return { u: this.creds.username, t: this.creds.subsonicToken, s: this.creds.subsonicSalt };
  }

  // ---- Navidrome's own API (password sign-in only) ----

  // Whether play statistics, playlist covers and shares are available.
  get hasNativeSession(): boolean {
    return this.transport.hasJwt;
  }

  // A custom cover for a playlist, stored by Navidrome for every client.
  async uploadPlaylistImage(id: string, file: File): Promise<void> {
    if (!this.transport.hasJwt) throw new ApiError(t("errors.coverNeedsNative"));
    const body = new FormData();
    body.append("image", file);
    const res = await this.transport.native(
      `playlist/${encodeURIComponent(id)}/image`,
      { method: "POST", body },
      { allow403: true },
    );
    if (res.status === 403) throw new ApiError(t("errors.noPermission"), 403);
    if (!res.ok) throw new ApiError(t("errors.coverHttp", { status: res.status }), res.status);
  }

  // A public link to the given albums, or null when sharing isn't possible.
  async createShare(ids: string[], description?: string): Promise<string | null> {
    if (!this.transport.hasJwt) return null;
    try {
      const res = await this.transport.native("share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceType: "album", resourceIds: ids.join(","), description }),
      });
      if (!res.ok) return null;
      const share = (await res.json()) as { id?: string };
      return share.id ? `${this.creds.serverUrl}/share/${share.id}` : null;
    } catch {
      return null;
    }
  }
}
