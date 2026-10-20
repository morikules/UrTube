# Development guide

How the extension is built, how the data flows, and how to release it.

## Stack

| Part | Choice |
|---|---|
| Extension framework | [WXT](https://wxt.dev) (builds Firefox MV2) |
| UI | Svelte 5 (runes) + TypeScript |
| Database | IndexedDB via [Dexie](https://dexie.org) |
| Tests | Vitest + fake-indexeddb |

## Layout

| Path | Purpose |
|---|---|
| `src/entrypoints/background.ts` | The only writer to the database during normal use. Answers requests from pages and content scripts, keeps an in-memory cache of watched video IDs, broadcasts changes to YouTube tabs, runs the periodic browser-history sync, opens the welcome page on install. |
| `src/entrypoints/youtube.content/` | Runs on www/m.youtube.com: records viewing sessions and metadata (player API), marks thumbnails, hides cards, header switch, ⊘ and eye buttons, playlist progress, big player, preferred playback, YouTube-history sync and removals, “Watch later” cleanup. |
| `src/entrypoints/music.content.ts` | Runs on music.youtube.com: records plays (≥ 10 s) as music. Hides nothing. |
| `src/entrypoints/options/` | The add-on page (toolbar button): history, statistics, settings, appearance, data, about, welcome. |
| `src/lib/db.ts` | Schema and all database operations (imports, syncs, marks, deletion, backup). |
| `src/lib/settings.ts` | Settings with defaults and migrations. |
| `src/lib/i18n.ts`, `src/locales/` | Translations (see below). |
| `src/lib/youtube.ts`, `ytjson.ts` | URL parsing, page kinds, formatting, helpers for YouTube's JSON. |
| `src/lib/youtubeHistory.ts`, `playlists.ts` | Parsing YouTube's history and playlist pages (innertube JSON). |
| `src/lib/watchmarker.ts`, `takeout.ts`, `browserHistory.ts` | Import sources. |
| `src/lib/stats.ts` | Statistics (pure functions). |

## Data model

- **`videos`** – one row per video: title, status (`watched` / `unwatched` =
  reset by the user), first/last view, view count, channel, duration, Short,
  music flag, …
- **`views`** – one row per view: time, kind (`watch` = session recorded here,
  `marked`, `imported`), source (`extension`, `manual`, `youtube-progress`,
  `browser-history`, `youtube-history`, `watchmarker`, `takeout`,
  `youtube-music`), progress, entry point, playlist, flags `dateUncertain`
  (bulk import day) and `dayOnly` (YouTube history only knows the day).
- **`deleted`** – tombstones: automatic sources never bring a deleted video back
  (unless it is watched again after the deletion).
- **`dismissed`** – videos, playlists and channels hidden with ⊘ (not part of
  the history).
- **`playlists`** – cached playlist contents; **`ytTokens`**, **`pendingRemovals`** –
  removal from the YouTube history.

### Rules for sources

- The extension's own recordings are never changed by imports or syncs.
- Browser- and YouTube-history syncs only **add missing videos** (one view, the
  earliest date). They never add rewatches, so they can run any number of times.
- The Google Takeout import adds every watch (rewatches included). A Takeout
  entry within one hour of a known exact view of the same video is the same
  watch (matched one to one). Undated or day-only views of a video that is in
  the Takeout are replaced by the exact times. The Watchmarker import respects
  existing Takeout views, so the order of imports does not matter.
- Days with ≥ 500 Watchmarker entries are bulk imports; their dates are marked
  uncertain and only count under “Everything” in the statistics.

### Music

`musicKind()` in `src/lib/youtube.ts`: *sure* = played in YouTube Music
(Takeout or music.youtube.com) or a “– Topic” channel (YouTube's raw channel
name, not translated); *category* = YouTube category “Music” (optional setting).

## Talking to YouTube

Requests to YouTube's internal API (`/youtubei/v1/browse`, `feedback`,
`browse/edit_playlist`) run **inside a YouTube tab**, with the page's own
configuration (`ytcfg`) and the usual `SAPISIDHASH` authorization header, so no
cookie permission is needed. Firefox lets content scripts reach page objects
through `wrappedJSObject` (player API, `ytcfg`).

YouTube changes its markup and JSON regularly. Parsers are tolerant
(`walkKeys`), and the playlist cache has a format version (`PLAYLIST_FORMAT`)
that forces a re-read after parser changes.

## Translations

- All texts are in `src/locales/en.ts` (default) and `src/locales/de.ts`; the
  German file is typed as `Messages`, so a missing or extra key is a type error.
- Functions take already formatted numbers/dates as strings. In longer texts,
  `**bold**` and `` `code` `` are rendered by `Rich.svelte`.
- `setLanguage()` must run before rendering; pages reload when the language
  setting changes. Texts drawn by CSS on YouTube (badges) come from CSS
  variables set in `applySettingsClasses()`.
- Manifest texts (name, description, toolbar title) are in `public/_locales`.
- New language: copy `en.ts`, translate, register it in `i18n.ts`, add it to the
  language choice (`DesignAddon.svelte`, `WelcomePage.svelte`) and to
  `public/_locales`.

## Tests

```bash
npm test
npm run check
```

Tests run in the time zone Europe/Berlin (`vitest.config.ts`) because some day
boundaries are written for it. An optional test reads your own Watchmarker
exports: `YTT_DATA_DIR=/path/to/exports npm test` (`YTT_DATA_EXCLUDE=<text>` skips
files whose name contains it). Never commit real data.

## Releasing (Firefox)

1. Raise `version` in `package.json` – every submission needs a new number.
2. Add the changes to `CHANGELOG.md`.
3. `.env` (from `.env.example`) needs AMO API credentials
   (https://addons.mozilla.org/developers/addon/api/key/).
4. `npm run sign` – runs the tests, builds, uploads build and source archive.
   - `AMO_CHANNEL=unlisted` (default): AMO only signs; the `.xpi` lands in
     `signed/` (and `RELEASE_DIR`).
   - `AMO_CHANNEL=listed`: the version is published on addons.mozilla.org after
     review. The listing itself (description, screenshots, categories) is
     edited on the AMO developer hub.

The gecko ID `youtube-tracker@privat.local` in `wxt.config.ts` must never change:
Firefox would treat the add-on as a new one and its data would be lost.

## Chrome

Not supported yet. What a port needs:

- Build with `wxt build -b chrome` (Manifest V3; the background script becomes
  a service worker – the in-memory caches must tolerate being restarted).
- Chrome has no `wrappedJSObject`. The parts that read page objects
  (`player.ts`, `playerPrefs.ts`, `innertube.ts`, `music.content.ts`) need a small
  script in the page's main world (`world: 'MAIN'`) that talks to the content
  script via `postMessage`.
- `browser_specific_settings` and `data_collection_permissions` are Firefox-only;
  the Chrome Web Store needs its own listing, privacy answers and a one-time
  developer fee.
