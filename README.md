<p align="center"><img src="public/icon/128.png" width="96" alt="UrTube logo"></p>

# UrTube

**Modern tracking for a better watching experience.**

A Firefox extension that remembers every YouTube video you watch, marks watched
videos everywhere on YouTube, hides them where you want, and shows your history
and statistics. Everything is stored locally in your browser – no server, no
account, no analytics.

It combines what used to take several extensions (marking watched videos,
tidying up subscriptions, a bigger player) in one, with a single database.

English and German.

<p align="center">
  <img src="docs/screenshots/1-history.png" width="49%" alt="History with a video expanded">
  <img src="docs/screenshots/2-statistics.png" width="49%" alt="Statistics">
</p>

## Features

- **Recording** – every video you open, with date, progress, where you came from
  and rewatches. Optionally also the red progress bar, the Firefox history, the
  YouTube history (also from your phone or TV) and music played on
  music.youtube.com.
- **Marking** – watched thumbnails are faded, grayed out and/or get a “✓ date”
  badge; an eye button marks or unmarks a video by hand.
- **Hiding** – a switch in the YouTube header hides watched videos in
  subscriptions, on the home page, on channel pages (each with a time window),
  in playlists, search results and recommendations. Content filters for
  Shorts, premieres, live streams, members-only videos and “Most relevant”.
- **⊘ Hide** – hide videos, playlists or whole channels you are not interested
  in, without counting them as watched.
- **Playlists** – “12 / 23 watched” on playlist thumbnails; finished playlists
  can be hidden.
- **History & statistics** – searchable history with every view; statistics by
  period, channel and where you open videos.
- **Import** – Google Takeout (your full YouTube history with exact times) and
  YouTube Watchmarker exports. Imports never count anything twice; for every
  view the most exact date wins.
- **Clean up** – remove watched videos from “Watch later”, remove deleted
  videos from your YouTube history.
- **Playback** – a big player that fills the window in theater mode, preferred
  resolution, speed and subtitles.
- **Backup & restore** as a JSON file.

## Privacy

All data lives in the extension's IndexedDB in your Firefox profile. The
extension only talks to youtube.com, from inside your YouTube tabs and the same
way the site itself does (with your login) – to read playlists and your watch
history, and to edit “Watch later” or your history when you ask it to. The
browser history is only read if you enable that sync and grant the permission.
Nothing is sent anywhere else.

## Install

- **Firefox:** from addons.mozilla.org *(link follows after publication)*, or a
  signed `.xpi` from the releases.
- **Chrome:** not yet (see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#chrome)).

After installing, a short introduction opens; it can be shown again from the
About tab.

## Development

Requirements: Node.js 22, npm.

```bash
npm install
npm test          # unit tests (Vitest)
npm run check     # type check (svelte-check)
npm run build     # builds .output/firefox-mv2
npm run dev       # dev mode with auto-reload (starts its own Firefox)
```

Load the build temporarily: Firefox → `about:debugging#/runtime/this-firefox` →
*Load Temporary Add-on…* → select `.output/firefox-mv2/manifest.json`.

More: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) (architecture, data model,
translations, releasing) and [CHANGELOG.md](CHANGELOG.md).

## Feedback and ideas

UrTube is a hobby project and keeps growing – feedback is very welcome!
[Report a bug](https://github.com/morikules/UrTube/issues/new?template=bug.yml),
[suggest an idea](https://github.com/morikules/UrTube/issues/new?template=idea.yml)
or leave a review on addons.mozilla.org. English or German is fine.

## Thanks

Built on the ideas of
[YouTube Watchmarker](https://github.com/sniklaus/youtube-watchmarker) by Simon Niklaus,
[Better Subscriptions for YouTube](https://github.com/OsaSoft/youtube-better-subscriptions) by Oscar Hernandez (OsaSoft) and
[Youtube Fullscreen Mode](https://greasyfork.org/scripts/434075-youtube-fullscreen-mode) by ndaesik.
No code was taken from these projects.

## License

[MIT](LICENSE) © 2026 morikules. Made with Claude Opus 5.5.

Not affiliated with YouTube or Google.
