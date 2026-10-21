# Browser tests

## `app.spec.ts` — the app against a mocked Navidrome

Drives the real app in Chromium. Every `/rest`, `/auth` and `/api` request is
answered by the test (`page.route`), so no server is needed. It checks the
login screen (username + password only), sign-in and session restore, that all
API calls go to the configured server, the fixed palette, that Settings has no
theme presets or desktop/update/Jellyfin features, logout, and the phone
layout. Screenshots land in `test-results/app/`.

## Run it

```bash
# one-time: install the browser
npx playwright install chromium

# run the tests (starts its own dev server on port 5180; E2E_PORT overrides)
npm run test:e2e

# watch it happen in a real browser
npx playwright test --headed
```

Set `PW_CHROMIUM_PATH` to use an already-installed Chromium instead of the
build this Playwright version pins.
