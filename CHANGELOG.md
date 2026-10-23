# Changelog

All notable changes. Versions before 1.0 were private test builds.

## 1.1.0 (in progress)

- New: channel pages show how much of the channel you watched, below the
  number of videos in the header: videos, Shorts, live streams and playlists,
  each as watched / total (a playlist counts once all its videos are watched).
  Counted once a day and remembered in between; ↻ counts again right away.
  Can be switched off under Appearance → Thumbnails.
- Backups include the settings; restoring can take them over (on by default).
- Restoring a backup also repairs views from before 1.0.2 (continued watching
  counted as several views), and missing video details are fetched right away.
- Data → Clean up shows when video details were last filled in.
- Shorts in playlists and a channel's Shorts are counted.
- Playlist progress labels stay on one line, like YouTube's own labels.
- Channel trailers are paused after their first frame, so they stay visible.
- New: the hide switch can work per area (subscriptions, home page, channel
  pages, playlists and Watch later, search and recommendations); the switch
  on a page then shows and changes that area (Settings → Hiding).
- Channel statistics also count members-only videos where YouTube gives out
  the list; the members-only filter on channel pages uses it too.
- Playlist labels only on playlist thumbnails, no longer on shelf headings of
  channel pages.
- The "Hide channel" and "Watched" buttons look like YouTube's own buttons and
  are readable in dark mode.
- Changing the language reloads the add-on page right away.
- New: merging a backup adds what is missing and deletes nothing (next to
  restoring, which replaces everything).
- New: Settings → Hiding → Channel memberships, with the members-only filters
  and an option to leave members-only videos out of the channel statistics.
- Channel names in the history and statistics open the channel page.
- New: Statistics → "Show all channels": every channel you watched something
  of plus your subscriptions (read from YouTube once a day), searchable and
  filterable to subscriptions only, with watched / total per channel and ↻ to
  count a channel right away.
- New statistics: longest and current streak, busiest day, new channels (count
  and chart), most rewatched videos, categories, and a year in review with the
  highlights of a chosen year.
- New history filters "Without channel details" (still to be filled in) and
  "No longer on YouTube" (deleted, private or a broken ID), with their numbers;
  such videos carry a badge.
- The channel list is always shown, as a table with channel pictures; click a
  column header to sort (channel, in history, uploads watched, share,
  playlists, counted). A channel's uploads are read up to 20,000 videos.
- Filling in video details shows live what it does (running, waiting for
  YouTube, stopped, done) and skips single broken videos instead of stopping.
- Switches: the knob sits centered in Firefox.
- Video details for older videos are fetched faster (about 7,000 per hour),
  slowing down when YouTube asks for a break, and only checked once a day
  once all videos have them.

## 1.0.2

- Watching a video in several sittings no longer counts as several views:
  playing an unfinished video from about where you stopped (YouTube resumes
  there) continues its view, however long ago that was; starting over counts
  as a new view. Opening a video without playing it adds nothing.
- Existing views are repaired once after the update: openings without
  playback and continuations of an unfinished view are merged into it.
- The “Live” badge in the history is now “Livestream”, with an explanation.
- New: channel trailers can be kept from playing by themselves
  (Settings → Playback → Channel pages).
- New: hiding members-only videos can also apply on channel pages
  (Settings → Hiding → Content filters).
- Watched videos are also marked among the suggestions at the end of a
  video (grayed out, faded, badge – as set under Appearance).
- New: videos taken from the progress bar or the YouTube history (e.g.
  watched on another device) get their channel, length and date from YouTube
  in the background (Settings → Recording, on by default). Optionally for all
  older videos too, e.g. after a Watchmarker import (Data → Clean up).

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
