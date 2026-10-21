# Developing NaviPlayer

How the code is put together, how to run it locally, and how to test it. For
installing and running NaviPlayer, see the [README](../README.md).

## Getting started

Requires [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
cp .env.example .env      # set VITE_NAVIDROME_URL to a Navidrome you can sign in to
npm run dev               # http://localhost:5173
```

The dev server proxies Navidrome on its own origin (`/rest`, `/auth`, `/api`,
`/share`) and runs the same LRCLIB relay as the production server, so no CORS
setup is needed while developing.

## Scripts

| Command                 | What it does                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`           | Vite dev server with hot reload                                                             |
| `npm run build`         | Type-check, build the app into `dist/` and the server into `dist-server/`                   |
| `npm run preview`       | Serve `dist/` locally                                                                       |
| `npm run server`        | Run the built server (`dist-server/index.js`)                                               |
| `npm run server:dev`    | Run the server from source, restarting on changes                                           |
| `npm test`              | Jest: unit, component and server integration tests                                          |
| `npm run test:coverage` | The same, with a coverage report                                                            |
| `npm run test:e2e`      | Playwright end-to-end tests (run `npx playwright install chromium` once)                    |
| `npm run type-check`    | `vue-tsc` over the app, server, tests and tooling                                           |
| `npm run lint`          | ESLint, fixing what it can (`lint:check` only reports)                                      |
| `npm run format`        | Prettier                                                                                    |
| `npm run icons`         | Regenerate the favicon and app icons, and copy in the in-app logo, from `branding/logo.svg` |

## Tech stack

| Concern               | Choice                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| UI                    | [Vue 3](https://vuejs.org), Composition API, `<script setup lang="ts">` single-file components                   |
| State                 | [Pinia](https://pinia.vuejs.org)                                                                                 |
| Routing               | [Vue Router](https://router.vuejs.org), every view lazy-loaded                                                   |
| Server data           | [TanStack Query for Vue](https://tanstack.com/query)                                                             |
| Translations          | [Vue I18n](https://vue-i18n.intlify.dev)                                                                         |
| Accessible primitives | [Reka UI](https://reka-ui.com) (dialogs, menus), [Lucide](https://lucide.dev) icons                              |
| Build                 | [Vite](https://vite.dev), TypeScript, `vue-tsc`                                                                  |
| Server                | Node.js + [Hono](https://hono.dev)                                                                               |
| Tests                 | [Jest](https://jestjs.io) + [Vue Test Utils](https://test-utils.vuejs.org), [Playwright](https://playwright.dev) |
| Quality               | ESLint (`eslint-plugin-vue`, `typescript-eslint`), Prettier                                                      |

`dependencies` in `package.json` lists only what the Node server needs at
runtime. The browser app's libraries are `devDependencies` because Vite bundles
them into `dist/`, which keeps the production image small.

## Project layout

```
src/
  main.ts           bootstrap: Pinia, router, Vue Query, i18n, config + session
  App.vue           splash → login screen or the signed-in shell
  router/           routes
  views/            one component per route
  components/
    base/           icon, slider, menus, dialog, loading/error states
    layout/         app shell, sidebar, top bar, mobile nav, command palette, toast
    library/        album/artist cards, track rows and lists, selection bar
    player/         now-playing bar, full-screen player, queue and lyrics panels
    dialogs/        add to playlist, download, upload, keyboard shortcuts
    settings/       settings controls, equaliser, shortcuts, server info, debug tools
    auth/           login screen
  stores/           Pinia stores: session, settings, player, history, stars, ui…
  composables/      lyrics, shortcuts, media session…
  services/         audio engine (audio/), downloads, uploads, lyrics, sharing, playback helpers
  api/              Navidrome client (client.ts on transport.ts), sign-in, saved session, stats, types
  lib/              pure logic: config, formatting, radio and artist radio, shuffle, logging…
  i18n/             vue-i18n setup and the en / pt messages
  styles/           global CSS and the palette tokens
server/
  index.ts          wiring: security headers, /api/config, routes, start-up
  config.ts         environment settings, checked at start
  proxy.ts          passing /rest, /auth, /api and /share on to Navidrome
  library.ts        admin uploads and "organize"
  zipDownload.ts    converted album/playlist ZIPs
  previews.ts       link-preview cards for chat apps
  staticFiles.ts    the built app, and its pages for client-side routes
  shell.ts          renaming the page and manifest (VITE_APP_NAME)
  navidrome.ts      the server's own calls to Navidrome (admin check, scans)
  lrclib.ts         the LRCLIB relay (also mounted by the Vite dev server)
  appName.ts        display-name rules (a copy of src/lib/appName.ts, kept in sync by a test)
branding/logo.svg   master logo for `npm run icons`
docker/             example nginx site for static hosting
tests/              Jest: unit/, integration/, helpers
e2e/                Playwright
```

## How a few things work

**Talking to Navidrome.** `src/api/client.ts` has a method for every call the
app makes; `src/api/transport.ts` does the requests (Subsonic tokens, the JSON
envelope, Navidrome's own API with its JWT, errors). Statistics are computed in
`src/api/listeningStats.ts`.
The client name sent to Navidrome (`c=navi-player`) is fixed, whatever the
display name, so per-player transcoding settings survive a rename.

**Sign-in.** The password goes to Navidrome's `/auth/login` once and is never
stored. What's kept in `localStorage` is described in the README's
[Security](../README.md#security-and-privacy) section.

**Radio.** Infinite radio (`lib/radio.ts`, `lib/recommendations.ts`) follows the
last track you chose. Artist radio (`lib/artistRadio.ts`) is a station anchored
to one artist; the player store keeps it topped up (`startArtistRadio`,
`fetchStationTracks`).

**Logging.** `lib/log.ts` writes to the console and to an in-memory history (the
last 500 messages, with credentials masked) shown in Settings → Advanced →
Recent logs. Use `log.error/warn/info/debug(scope, …)`; never log passwords or
tokens.

## Languages

Messages live in `src/i18n/locales/`. `en.ts` is the source of truth; every
other locale is typed against it, so a missing key fails `npm run type-check`.
A Jest test also checks that translations keep each English message's
`{placeholders}` and plural forms (`"{n} track | {n} tracks"`).

To add a language, copy `pt.ts`, translate it, and register it in
`src/i18n/index.ts` (`LOCALES`, `LOCALE_NAMES` and its `lang` tag).

## Tests

- `tests/unit/` — stores, services and pure logic, plus component tests with
  Vue Test Utils. Navidrome and LRCLIB are mocked by replacing `fetch`; no
  network is needed.
- `tests/unit/server/` — the LRCLIB relay against a fake LRCLIB.
- `tests/integration/server.spec.ts` — starts the real Node server against a
  mock Navidrome: proxying (including a base path), compression, headers, path
  traversal, uploads, link previews and config validation.
- `e2e/` — Playwright starts its own dev server on port 5180 with a fixed
  configuration, so your `.env` doesn't affect it. Set `PW_CHROMIUM_PATH` to
  use an already-installed Chromium.

Jest compiles `.vue` files with `tests/vue-transformer.cjs`, a small
transformer built on Vue's `@vue/compiler-sfc`.

All tests run against mocks. Behaviour that depends on a real Navidrome
(playback, transcoding, Last.fm data, uploads, shares) needs checking by hand.

## Building the Docker image

```bash
docker build -t navi-player:dev .
docker run --rm -p 8680:8080 -e VITE_NAVIDROME_URL=http://192.168.1.50:4533 navi-player:dev
```

To publish to your own registry, tag with its address and the version from
`package.json`, then push:

```bash
docker build -t registry.example.lan:5000/navi-player:v0.1.4 .
docker push registry.example.lan:5000/navi-player:v0.1.4
```

A registry on plain HTTP has to be listed under `insecure-registries` in the
Docker daemon's config (Podman: `podman push --tls-verify=false`).
