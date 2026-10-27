# Changelog

All notable changes. Versions before 1.0 were private test builds.

## 1.4.0 (in progress)

- History: several entries of "Show" can be chosen at once; a video has to
  match all of them (e.g. "Music only" and "Watched more than once").
- New content filter "Hide films": films from YouTube's film shop (to buy,
  rent or free with ads).
- Big player with the header "with the player controls, over the video": the
  mouse on the header now also brings up the player's controls, so both always
  appear and disappear together.
- Fixed: after a right click on the YouTube logo (e.g. "Open in new tab"), the
  hidden header stayed visible for the rest of the video.
- No longer asks for access to all browser tabs: YouTube tabs are found
  through the YouTube permission.
- YouTube Music: marking heard tracks reacts only to changes of the track
  lists, not to every tick of the player; YouTube Music's own tooltips stay.
- The one-time repair of views from before 1.0.2 is removed (done for all
  installs since).

## 1.3.0

- Watching the rest of a long video no longer counts twice: a view counts as
  finished from 90 %, but if it stopped more than 30 seconds before the end,
  playing on from there (e.g. after the tab was reloaded) continues it.
- Time watched is at least up to where a view got (skipped parts count); a
  finished view counts with the full length – in the history, the statistics
  and the CSV export.
- Google Takeout import: for the time the Takeout covers, its exact times
  replace the Watchmarker views of the same videos (Watchmarker often noted a
  video later than it was watched, which showed up as a second view). Older
  Watchmarker views stay. The result is the same whichever is imported first;
  importing the Takeout again cleans up existing data.
- History: new filter "Without exact date" (views from a bulk import, day only
  or the progress bar), with its number.
- History: "Finished" for videos to continue or given up – the latest view
  counts as watched to the end; also for selected videos.
- History: "not music" corrects the music detection, e.g. for videos played in
  the YouTube Music app; can be undone ("music after all"), also for selected
  videos, kept in backups.

## 1.2.0

- Fixed: counting a channel (↻ in the statistics) and other work that runs
  through a YouTube tab failed with "Receiving end does not exist" when the
  first YouTube tab was unloaded by Firefox or opened before an update; all
  YouTube tabs are now tried, with a clearer message if none is ready.
- New: things hidden with ⊘ can stay hidden while the header switch is off –
  watched videos are then shown and marked (Settings → Hiding → Hiding with ⊘).
- New: the content filters (Shorts, premieres, live streams, members only) can
  also work on the home page and next to a video (Settings → Hiding → Content
  filters).
- New: with the big player and a hidden header, you choose when the header
  comes back (Appearance → Player): only at the top edge, together with the
  player's controls over the video (default), or with the controls as normal
  theater mode – header above, title and channel below the video; it turns
  big again after 3 seconds without any activity (unless scrolled down). The
  header over the video can have a solid background instead of see-through.
- "Hide live streams" also hides recordings of streams that have ended
  ("Streamed … ago"; can be switched off); "Most relevant" has an explanation.
- Shorts are recognized when video details are filled in, e.g. for videos from
  a Google Takeout import; short videos filled in earlier are checked once more.

## 1.1.0

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
- History: new filters "Continue watching" (unfinished videos; the thumbnail
  opens them where you stopped, with a red progress bar), length and date
  range (from the oldest entry to today); "Select all" selects every video
  matching search and filters, and selected videos can be exported as CSV.
- Statistics are split into Videos, Channels and Year in review, more compact
  with smaller charts; new: time per channel (total length of the videos
  watched), top 5 categories and the last video in the year in review.
- Add-on page: no header any more – name and logo sit at the right of the menu
  bar; the totals moved into the statistics ("Watched more than once"). A ↑
  button brings you back to the top; the history keeps its scroll position
  when the page is reloaded.
- History: new filter "Watched more than once"; deleting a single view no
  longer makes the rows jump.
- History: the actions for selected videos appear in the bar with "Select
  all" (which stays at the top while scrolling), so the list does not move;
  every chosen filter has an ✕ that sets it back to "All".
- History: new labels and filters "Given up" (unfinished and not continued
  for three months),
  "Premiere", "Members only" (from counted channels) and "Hidden with ⊘", plus
  a filter by origin (recorded here, YouTube/Firefox history, progress bar,
  Watchmarker, Takeout).
- Statistics: a finished video counts with its full length as time watched,
  even if parts were skipped; "Most rewatched" sits next to the categories
  (instead of "Where you open videos").
- New: Settings → Playback → Live streams: hide the chat automatically.
- Views remember which YouTube account they were recorded with (a short hash,
  no e-mail address) – not shown or used for filtering yet.
- Data → Backup: export all videos or all views as CSV (for Excel/LibreOffice).
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
- Watched videos are hidden before YouTube draws them (with the interval
  “immediately”, the default), also right after reloading the subscriptions –
  no more flashing of watched videos and their red bars.
- At the end of a video, the videos the channel placed there are marked too;
  videos hidden with ⊘ are left out there while hiding is on.
- Safer: CSV exports cannot run formulas from video titles; backups, settings
  in backups and Watchmarker files are checked entry by entry; only real clicks
  work the buttons on YouTube; YouTube pages can only send the add-on what they
  need; the diagnosis of the YouTube history sync contains no titles or IDs.
- The add-on page in a background tab no longer reloads its data on every
  change, only once when it is shown again.
- About page: "Write a review" always opens UrTube's store page; links to
  GitHub and addons.mozilla.org at the bottom.
- New wording on the About page and in the store: keep track of what you have
  and have not watched; FAQ about continuing videos, channel numbers and
  moving to another computer.

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
