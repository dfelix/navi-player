<script setup lang="ts">
// The command palette (Ctrl/⌘+K): type to jump anywhere or do anything.
//
// The list mixes commands (going to a page, playback, panels), which are
// matched in the browser on every keystroke, with playlists and library
// results from the server, asked for once typing pauses. Enter runs whatever
// is highlighted.
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { useRouter } from "vue-router";
import type { Playlist, SearchResult } from "@/api/types";
import AppIcon from "@/components/base/AppIcon.vue";
import CoverArt from "@/components/base/CoverArt.vue";
import type { IconName } from "@/components/base/icons";
import { formatCount } from "@/lib/format";
import { matchScore } from "@/lib/fuzzyMatch";
import { usePlayerStore } from "@/stores/player";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import "./commandpalette.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

interface Entry {
  id: string;
  label: string;
  sublabel?: string;
  icon?: IconName;
  coverArt?: string;
  group: string;
  run: () => void;
}

// The server is asked once typing pauses this long; commands don't wait.
const TYPING_PAUSE_MS = 180;
const SHOWN = { commands: 6, playlists: 4 };
const NOTHING_FOUND: SearchResult = { artist: [], album: [], song: [] };

const router = useRouter();
const player = usePlayerStore();
const session = useSessionStore();
const settings = useSettingsStore();
const ui = useUiStore();
const input = useTemplateRef<HTMLInputElement>("input");

const term = ref("");
const active = ref(0);
const found = ref<SearchResult>(NOTHING_FOUND);
const playlists = ref<Playlist[]>([]);

const open = (path: string) => () => void router.push(path);

function close(): void {
  ui.commandPaletteOpen = false;
  term.value = "";
  active.value = 0;
  found.value = NOTHING_FOUND;
}

// On opening: focus the box and fetch the playlists (few, and not covered by
// the server's search).
watch(
  () => ui.commandPaletteOpen,
  async (isOpen) => {
    if (!isOpen) return;
    active.value = 0;
    await nextTick();
    input.value?.focus();
    playlists.value = (await session.client?.getPlaylists().catch(() => [])) ?? [];
  },
);

// Ask the server once typing pauses; an answer to an older query is dropped.
let pause: ReturnType<typeof setTimeout> | undefined;
let latest = 0;
watch(term, (typed) => {
  clearTimeout(pause);
  pause = setTimeout(async () => {
    const query = typed.trim();
    const asked = ++latest;
    const answer =
      query.length >= 2 && session.client
        ? await session.client
            .search(query, { artistCount: 4, albumCount: 4, songCount: 6 })
            .catch(() => NOTHING_FOUND)
        : NOTHING_FOUND;
    if (asked === latest) found.value = answer;
  }, TYPING_PAUSE_MS);
});

const PAGES: [path: string, icon: IconName, name: string][] = [
  ["/", "home", "nav.home"],
  ["/albums", "disc", "nav.albums"],
  ["/artists", "mic", "nav.artists"],
  ["/genres", "tag", "nav.genres"],
  ["/favourites", "heart", "nav.favourites"],
  ["/history", "clock", "nav.history"],
  ["/stats", "server", "nav.stats"],
  ["/recap", "trending", "nav.recap"],
  ["/settings", "settings", "nav.settings"],
];

const commands = computed<Entry[]>(() => {
  const playing = player.state.isPlaying;
  const { showQueuePanel, showLyricsPanel } = settings.layout;
  const playback = t("palette.groupPlayback");
  const view = t("palette.groupView");
  return [
    ...PAGES.map(([path, icon, name]) => ({
      id: `go:${path}`,
      label: t("palette.goTo", { page: t(name) }),
      icon,
      group: t("palette.groupGo"),
      run: open(path),
    })),
    {
      id: "play-pause",
      label: t(playing ? "player.pause" : "player.play"),
      icon: playing ? "pause" : "play",
      group: playback,
      run: player.togglePlay,
    },
    { id: "next", label: t("player.next"), icon: "next", group: playback, run: player.next },
    {
      id: "prev",
      label: t("player.previous"),
      icon: "prev",
      group: playback,
      run: player.previous,
    },
    {
      id: "shuffle",
      label: t(player.state.shuffle ? "palette.shuffleOff" : "palette.shuffleOn"),
      icon: "shuffle",
      group: playback,
      run: player.toggleShuffle,
    },
    {
      id: "repeat",
      label: t("palette.cycleRepeat"),
      icon: "repeat",
      group: playback,
      run: player.cycleRepeat,
    },
    {
      id: "full-screen",
      label: t("palette.openFullScreen"),
      icon: "chevron-right",
      group: playback,
      run: () => void (ui.fullScreen = true),
    },
    {
      id: "queue",
      label: t(showQueuePanel ? "palette.hideQueue" : "palette.showQueue"),
      icon: "queue",
      group: view,
      run: () => settings.update((s) => void (s.layout.showQueuePanel = !showQueuePanel)),
    },
    {
      id: "lyrics",
      label: t(showLyricsPanel ? "palette.hideLyrics" : "palette.showLyrics"),
      icon: "lyrics",
      group: view,
      run: () => settings.update((s) => void (s.layout.showLyricsPanel = !showLyricsPanel)),
    },
  ];
});

// The `limit` best matches for the query, best first.
function bestMatches<T>(items: T[], text: (item: T) => string, query: string, limit: number): T[] {
  return items
    .map((item) => ({ item, score: matchScore(query, text(item)) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}

const entries = computed<Entry[]>(() => {
  const query = term.value.trim();
  if (!query) return commands.value.slice(0, SHOWN.commands);
  const library = t("palette.groupLibrary");
  const { artist, album, song } = found.value;
  return [
    ...bestMatches(commands.value, (c) => c.label, query, SHOWN.commands),
    ...bestMatches(playlists.value, (p) => p.name, query, SHOWN.playlists).map((p) => ({
      id: `playlist:${p.id}`,
      label: p.name,
      sublabel: formatCount(p.songCount ?? 0, "track"),
      icon: "list" as IconName,
      group: t("nav.playlists"),
      run: open(`/playlist/${p.id}`),
    })),
    ...artist.map((a) => ({
      id: `artist:${a.id}`,
      label: a.name,
      sublabel: t("palette.artist"),
      icon: "mic" as IconName,
      group: library,
      run: open(`/artist/${a.id}`),
    })),
    ...album.map((al) => ({
      id: `album:${al.id}`,
      label: al.name,
      sublabel: al.artist,
      coverArt: al.coverArt,
      group: library,
      run: open(`/album/${al.id}`),
    })),
    // A song is something to hear, so choosing one plays it.
    ...song.map((so) => ({
      id: `song:${so.id}`,
      label: so.title,
      sublabel: so.artist,
      coverArt: so.coverArt,
      group: t("palette.groupTracks"),
      run: () => player.playNow([so], 0),
    })),
  ];
});

// Results keep arriving; don't let the highlight point past the end.
watch(entries, (list) => {
  active.value = Math.min(active.value, Math.max(0, list.length - 1));
});

function runActive(): void {
  const chosen = entries.value[active.value];
  if (!chosen) return;
  close();
  chosen.run();
}

const KEYS: Record<string, () => void> = {
  Escape: close,
  Enter: runActive,
  ArrowDown: () => (active.value = Math.min(active.value + 1, entries.value.length - 1)),
  ArrowUp: () => (active.value = Math.max(active.value - 1, 0)),
};

function onKeyDown(event: KeyboardEvent): void {
  const handle = KEYS[event.key];
  if (!handle) return;
  event.preventDefault();
  handle();
}
</script>

<template>
  <div v-if="ui.commandPaletteOpen" class="cmdk-backdrop" @click="close">
    <div class="cmdk" role="dialog" aria-modal="true" :aria-label="t('palette.title')" @click.stop>
      <div class="cmdk-input-row">
        <AppIcon name="search" :size="17" />
        <input
          ref="input"
          v-model="term"
          class="cmdk-input"
          :placeholder="t('palette.placeholder')"
          :aria-label="t('palette.placeholder')"
          autocomplete="off"
          :spellcheck="false"
          @input="active = 0"
          @keydown="onKeyDown"
        />
        <kbd class="cmdk-esc">Esc</kbd>
      </div>

      <ul v-if="entries.length > 0" class="cmdk-list" role="listbox">
        <template v-for="(entry, i) in entries" :key="entry.id">
          <!-- A heading where the kind of result changes. -->
          <li
            v-if="i === 0 || entries[i - 1]?.group !== entry.group"
            class="cmdk-group"
            aria-hidden="true"
          >
            {{ entry.group }}
          </li>
          <li
            class="cmdk-item"
            :class="{ 'cmdk-item-active': i === active }"
            role="option"
            :aria-selected="i === active"
            @mouseenter="active = i"
            @click="runActive"
          >
            <CoverArt
              v-if="entry.coverArt"
              :cover-art="entry.coverArt"
              :size="28"
              alt=""
              class="cmdk-cover"
            />
            <AppIcon v-else :name="entry.icon ?? 'play'" :size="16" />
            <span class="cmdk-label">{{ entry.label }}</span>
            <span v-if="entry.sublabel" class="cmdk-sublabel muted">{{ entry.sublabel }}</span>
          </li>
        </template>
      </ul>
      <div v-else class="cmdk-empty muted">
        {{ term.trim().length > 0 ? t("palette.nothingMatched") : t("palette.startTyping") }}
      </div>
    </div>
  </div>
</template>
