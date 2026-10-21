# addons.mozilla.org listing

Texts for the AMO developer hub (Edit product page). English is the default
locale; add German via “Add a localization”.

## Name

UrTube

## Summary (max. 250 characters)

**English:** Modern tracking for a better watching experience. Remembers every YouTube video you watch, marks and hides watched videos, imports your history and shows statistics – all stored locally, no account, no tracking.

**Deutsch:** Modernes Tracking für ein besseres Seherlebnis. Merkt sich jedes gesehene YouTube-Video, markiert und blendet Gesehenes aus, importiert deinen Verlauf und zeigt Statistiken – alles lokal, ohne Konto, ohne Tracking.

## Description – English

UrTube remembers every YouTube video you watch and keeps your subscriptions, home page and playlists tidy – so new videos don't get lost among the ones you already know.

**What it does**
- Records every video you open – with date, progress and rewatches. Optionally also YouTube's red progress bar, your Firefox history, your YouTube history (also from phone or TV) and music on music.youtube.com.
- Marks watched videos everywhere: faded, black-and-white or with a “✓ date” badge. An eye button marks or unmarks by hand.
- Hides watched videos with one switch in the YouTube header – in subscriptions, on the home page and channel pages (each with a time window), in playlists, search and recommendations.
- Content filters for subscriptions: Shorts, premieres, live streams, members-only videos.
- ⊘ hides videos, playlists or whole channels you're not interested in – without counting them as watched.
- Playlist progress (“12 / 23 watched”); finished playlists can be hidden.
- Searchable history and statistics by period, channel and where you open videos.
- Imports your full history from Google Takeout (with exact times) and from YouTube Watchmarker – nothing is counted twice.
- Cleans up “Watch later”, big player, preferred resolution, speed and subtitles.
- English and German, light and dark design, backup and restore.

**Privacy**
All data stays in your Firefox profile. No server, no account, no analytics. UrTube only talks to youtube.com, the same way the site itself does.

**Feedback welcome**
UrTube is a free hobby project. Ideas, wishes and bug reports are very welcome on GitHub: https://github.com/morikules/UrTube/issues

Not affiliated with YouTube or Google.

## Description – Deutsch

UrTube merkt sich jedes YouTube-Video, das du ansiehst, und hält Abos, Startseite und Playlists aufgeräumt – damit Neues nicht zwischen Bekanntem untergeht.

**Was es kann**
- Erfasst jedes geöffnete Video – mit Datum, Fortschritt und Wiederholungen. Auf Wunsch auch über YouTubes roten Fortschrittsbalken, den Firefox-Verlauf, deinen YouTube-Verlauf (auch von Handy oder Fernseher) und Musik auf music.youtube.com.
- Markiert Gesehenes überall: abgeblasst, schwarz-weiß oder mit „✓ Datum“. Ein Auge-Knopf markiert von Hand.
- Blendet Gesehenes mit einem Schalter in der YouTube-Kopfzeile aus – in Abos, auf Startseite und Kanalseiten (jeweils mit Zeitgrenze), in Playlists, Suche und Empfehlungen.
- Inhaltsfilter für Abos: Shorts, Premieren, Livestreams, Videos nur für Mitglieder.
- ⊘ blendet Videos, Playlists oder ganze Kanäle aus, die dich nicht interessieren – ohne dass sie als gesehen zählen.
- Playlist-Fortschritt („12 / 23 gesehen“); fertige Playlists lassen sich ausblenden.
- Durchsuchbarer Verlauf und Statistiken nach Zeitraum, Kanal und Herkunft.
- Importiert deinen kompletten Verlauf aus Google Takeout (mit genauer Uhrzeit) und aus YouTube Watchmarker – nichts wird doppelt gezählt.
- Räumt „Später ansehen“ auf, großer Player, bevorzugte Auflösung, Geschwindigkeit und Untertitel.
- Deutsch und Englisch, helles und dunkles Design, Sicherung und Wiederherstellung.

**Datenschutz**
Alle Daten bleiben in deinem Firefox-Profil. Kein Server, kein Konto, keine Analyse. UrTube spricht nur mit youtube.com – so wie die Seite selbst.

**Feedback willkommen**
UrTube ist ein kostenloses Hobbyprojekt. Ideen, Wünsche und Fehlermeldungen gern auf GitHub: https://github.com/morikules/UrTube/issues

Kein offizielles Produkt von YouTube oder Google.

## Other fields

| Field | Value |
|---|---|
| Categories | Photos, Music & Videos; (second) Privacy & Security |
| Tags | youtube, history, watched, subscriptions, playlist |
| Homepage | https://github.com/morikules/UrTube |
| Support site | https://github.com/morikules/UrTube/issues |
| Support email | leave empty |
| License | MIT |
| Privacy policy | not required (no data collected) |
| Source code | uploaded automatically by `npm run sign` |
| Notes for reviewers | Built with WXT (Vite + Svelte). Build: `npm ci && npm run build` → `.output/firefox-mv2`. Requests to youtube.com's internal API (youtubei/v1) run from the YouTube tab with the page's own config, only to read playlists/the watch history, to read a video's details (channel, length, date; "player" endpoint, a few per minute) and, when the user asks, edit “Watch later” or remove history entries. No remote code, no analytics. The validator warning “Unsafe assignment to innerHTML” in `chunks/options-*.js` is Svelte's runtime (`elem.innerHTML = …` in `svelte/src/internal/client/dom/reconciler.js`), which builds templates from static, compile-time strings; the extension's own code uses no `{@html}` and never inserts page or user content as HTML. |

## Screenshots (1280×800)

Ready in `docs/screenshots/`, made from demo data (openly licensed Blender
Studio and NASA videos, made-up viewing history), not from a real profile:

1. `1-history.png` – History with a video expanded (views listed).
2. `2-statistics.png` – Statistics, last 30 days.
3. `3-hide.png` – Settings → Hiding.
4. `4-import.png` – Import from Google Takeout and Watchmarker.
5. `5-about.png` – About.

Still to take on YouTube itself (with an account without personal details):
the subscriptions page with watched videos faded and the switch in the header,
and a playlist with “12 / 23 watched” badges.
