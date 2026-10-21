// The shapes of what Navidrome returns, limited to the fields the app reads.
// Field names are the Subsonic / OpenSubsonic API's own, so responses can be
// used as they arrive.

// What the current user has done with an item.
interface UserMarks {
  starred?: string; // when it was favourited (ISO date); absent if it isn't
  userRating?: number; // 1–5
  playCount?: number;
  played?: string; // last played (ISO date, OpenSubsonic)
}

export interface ArtistSummary extends Pick<UserMarks, "starred" | "playCount"> {
  id: string;
  name: string;
  coverArt?: string;
  albumCount?: number;
}

export interface Artist extends ArtistSummary {
  albums: Album[];
  biography?: string;
  similarArtist?: ArtistSummary[];
}

export interface Album extends UserMarks {
  id: string;
  name: string;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  duration?: number; // seconds
  year?: number;
  genre?: string;
  created?: string; // when it was added to the library
}

export interface AlbumWithSongs extends Album {
  song: Song[];
}

// Loudness information for volume levelling (OpenSubsonic).
export interface ReplayGain {
  trackGain?: number; // dB
  albumGain?: number;
  trackPeak?: number; // linear, 1 = full scale
  albumPeak?: number;
}

export interface Song extends UserMarks {
  id: string;
  parent?: string;
  title: string;
  album?: string;
  albumId?: string;
  artist?: string;
  artistId?: string;
  track?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  coverArt?: string;
  created?: string;

  // The file.
  path?: string;
  size?: number; // bytes
  suffix?: string;
  contentType?: string;
  duration?: number; // seconds
  bitRate?: number; // kbps
  codec?: string;
  sampleRate?: number;
  bitDepth?: number;
  channels?: number;
  replayGain?: ReplayGain;

  // Not from the server: marks a track Infinite radio added rather than one
  // the user picked. Such tracks are labelled in the queue and never used as
  // the seed for the next radio batch, which would make it drift.
  autoQueued?: boolean;
}

export interface Genre {
  value: string; // the genre's name
  songCount: number;
  albumCount: number;
}

export interface Playlist {
  id: string;
  name: string;
  comment?: string;
  owner?: string;
  public?: boolean;
  songCount: number;
  duration: number;
  created?: string;
  changed?: string;
  coverArt?: string;
}

export interface PlaylistWithSongs extends Playlist {
  entry: Song[];
}

export interface SearchResult {
  artist: ArtistSummary[];
  album: Album[];
  song: Song[];
}

export interface LyricsLine {
  start?: number; // milliseconds from the start, for synced lyrics
  value: string;
}

export interface StructuredLyrics {
  lang?: string;
  synced: boolean;
  line: LyricsLine[];
  displayArtist?: string;
  displayTitle?: string;
}

// A request to Navidrome that didn't succeed. `code` is the HTTP status or the
// Subsonic error code; `isAuthError` means the session (or the password) was
// refused.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly isAuthError = false,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// The request never got an answer: offline, wrong address, server down.
export class NetworkError extends ApiError {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}
