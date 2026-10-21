# Changelog

All notable changes. Versions before 1.0 were private test builds.

## 1.0.1

First release on addons.mozilla.org; no functional changes.

## 1.0.0

First public release, now called **UrTube**.

- New name and logo; feedback links (GitHub issues, reviews) on the About tab.
- English and German; the language follows the browser or can be picked under
  Appearance → Add-on. Dates and numbers follow the language and your time zone.
- Welcome page after installing.
- Conservative defaults for new installs: big player, Shorts filter and
  removing deleted videos from the YouTube history are off. Existing installs
  keep their settings.
- music.youtube.com: tracks played for at least 10 seconds are recorded as
  music; heard tracks are marked in lists (can be switched off); nothing is
  hidden there.
- The introduction can be opened again from the About tab.
- Uniform design of all settings pages; charts in the accent color; calmer
  About page with credits and author.
- MIT license, README, changelog, developer documentation.

## 0.7.1

- Hidden (⊘) videos and playlists remember their channel; the list of hidden
  items shows and searches it.
- Redesigned About tab with credits.

## 0.7.0

- Import of the YouTube watch history from Google Takeout: every watch with its
  exact time, rewatches included; already known watches are not counted twice;
  undated bulk-import entries get the real date. Order of imports does not matter.
- YouTube Music plays are flagged as music; history filters “Music only” /
  “Without music”.
- Music detection: YouTube Music (Takeout), “– Topic” channels and optionally the
  category “Music”; setting to keep music visible when hiding watched videos.
- About tab: version, privacy, FAQ, credits.

## 0.6.1

- Finer statistics ranges (7/30 days, months, years, everything); undated
  import videos counted under “Everything”.
- Hidden items per kind with “show all again” and an optional list.

## 0.6.0

- Statistics tab: watched videos over time, top channels, entry points, time
  watched, finished share.
- Hide whole channels.
- Clean up “Watch later” (manually or after every video).

## 0.5.x

- Playlists: progress on thumbnails, hide finished playlists, hiding inside
  playlists; fix for YouTube's new playlist layout.
- ⊘ button to hide videos and playlists without counting them as watched.
- Cancellable syncs, adjustable reaction delay, sync interval, Shorts recording,
  hiding in search and recommendations.

## 0.4.0

- Polished add-on page; preferred resolution, speed and subtitles.

## 0.3.0

- Restructured add-on page with tabs, light/dark theme; the toolbar button
  opens the page.

## 0.2.0 and earlier

- Local watch database, Watchmarker import, recording of viewing sessions,
  marking watched thumbnails, history list with editing.
- Watched conditions (open, play, red progress bar, browser and YouTube
  history), eye button, backup/restore.
- Sync of the YouTube watch history; removing deleted videos from it.
- Hiding watched videos with time windows, content filters, header switch.
- Big player on the video page.
