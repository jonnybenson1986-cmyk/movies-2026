# StreamBox

A Netflix-style player for live TV, sports and movies. It's a static Progressive Web App (PWA), so it installs on iPhone, iPad and Android straight from the browser. You don't need an app store.

## What's inside

| Section | Source |
|---|---|
| **Live TV** (~18,700 channels) | [iptv-org](https://github.com/iptv-org/iptv) (`playlists/iptv-org.m3u`), [Free-TV](https://github.com/Free-TV/IPTV) (`free-tv.m3u`), the free ad-supported services Samsung TV Plus, Pluto TV, Roku and Tubi (`fast-*.m3u`, from [app-m3u-generator](https://github.com/BuddyChewChew/app-m3u-generator)) and your VLC playlist (`VLC_TV_IPTV.xspf`), merged into `public/data/channels.json` with logos, countries and TV-guide IDs |
| **Movies** | Curated collections (MCU, Bond, Oscar contenders, Horror, Classics, Hallmark, …) from [KiduyuTv](https://github.com/kiduyu-klaus/KiduyuTv_final) lists — local catalog, Play buttons and switchable video sources |
| **Movy** | Live movies, TV shows, anime and 4K catalog browsing, with Vidy embeds protected by the companion browser extension |
| **Sports** | SKY Racing 1 & 2 (from `playlists/Sports_App_2026.html`) plus every sports channel in the playlist |
| **My List / Continue Watching** | Saved on the device (channels and movies) |
| **Settings → Playlists** | Add any extra M3U playlist URL |

## Deploy to Netlify

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project → GitHub**.
2. Pick this repo. `netlify.toml` fills in the settings automatically (publish directory `public`, no build command).
3. Click **Deploy**. You'll get a URL like `https://your-site.netlify.app`.

## TV guide ("Now / Next")

Settings → **TV guide (XMLTV)** → add the URL of an XMLTV guide (`.xml` or `.xml.gz`, https, and it must allow cross-origin requests). Channels then show "Now: …" on their card, and the player shows "Now … · Next 8:45 PM: …". Channels match a guide by their playlist `tvg-id`, or by name. If a playlist you add declares a guide in its `#EXTM3U url-tvg="…"` header, that guide is picked up automatically. Only the next ~36 hours are kept, and guide files over 80 MB are skipped.

## Backup & restore

Settings → **Backup & restore** → **Export backup** saves a `streambox-backup.json` with My List, watch history and your playlist and guide URLs. **Import backup** merges a backup into the current device. Imports are filtered, so only known item types with http(s) streams are kept.

## Accounts (username and password)

Everyone signs in with their own username and password. A Netlify edge function (`netlify/edge-functions/gate.js`) checks the sign-in on the server before **any** file is served, so it can't be skipped by editing the page. The sign-in is asked for again every time the app or page is closed. The accounts are `bb`, `jb`, `sb`, `tc`, `nn`, `bn` and `ja`. Usernames aren't case sensitive.

**What each account keeps** (saved on Netlify, so it follows the person to any phone or tablet):
- **My List** and **Continue Watching**
- **Where they are up to in a video**, for videos StreamBox plays itself (My Library). Opening a video again resumes where it was left, and finishing it clears the place. Movies played inside third-party players run in a frame StreamBox can't see into, so only "recently watched" is remembered for those.

People never see each other's data. Signing out clears the lists from that device (they stay in the account), and the next person to sign in starts with their own.

**How it works:** `netlify/functions/me.mjs` (`/api/me`) stores each account's data in Netlify Blobs; `public/js/account.js` pulls it when the app opens or comes back to the screen and pushes changes a couple of seconds after they happen. Lists use the most recent change; video places use the most recent place per video. On a computer with no gate (`python3 -m http.server`) there are no accounts and everything is saved on the device only.

**Set your own passwords (recommended):** the built-in list stores only salted hashes, but 4 to 6 digit passwords can be guessed, so use longer ones. In Netlify go to *Site configuration → Environment variables* and add `USERS` with JSON like `{"bb":"a-long-password","jb":"another-one"}`, then redeploy. When `USERS` is set it **replaces** the built-in list, so include everyone. That is also how you add or remove people. Changing someone's password signs them out. Wrong guesses are slowed by 0.8 s.

**Tests:** `npm test` covers the sign-in (`tests/gate.test.mjs`), the stored data and sync (`tests/accounts.test.mjs`).

## Connecting Spotify (one-off setup)

Spotify remote control needs a free Spotify developer app (no secret is used: the sign-in is OAuth with PKCE, and each device keeps its own tokens for the signed-in StreamBox person; signing out of StreamBox forgets them).

1. At [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) choose **Create app**. Under **Redirect URIs** add `https://<your-site>/spotify-callback.html` (the Music page shows the exact address). Tick **Web API** and save.
2. Copy the app's **Client ID** into Netlify as the environment variable `SPOTIFY_CLIENT_ID` (or paste it into the box the Music page shows; that only sets it on that device).
3. While the Spotify app is in development mode, add the Spotify account email of each person who will use it under **User Management**.
4. Each person taps **Connect Spotify** once. **Library → Disconnect Spotify** undoes it on a device.

The code is `public/js/spotify.js`, `public/spotify-callback.html` and `netlify/functions/spotify-config.mjs`, with tests in `tests/spotify.test.mjs`.

## Sign in with Face ID or a fingerprint

Each person can sign in with their face or fingerprint instead of typing their password, the way banking and other apps do. On the web this is a **passkey**: the device's own Face ID, Touch ID, fingerprint reader or Windows Hello.

- **Turning it on:** sign in with your password once. The app offers it a moment later (once per device), or use *Settings → Face ID / fingerprint sign-in → Set up on this device*. Settings lists each device you've set up, with a **Remove** button.
- **Signing in:** the sign-in screen shows **Sign in with Face ID or fingerprint**. On a device where it's set up it is the main button and opens by itself when you open the app (it doesn't pop back up right after you sign out). The password form is always still there.
- **What is stored:** your face or fingerprint never leaves the device. The device keeps a private key and proves it has it by signing a one-time challenge; the server keeps only the matching public key (Netlify Blobs, next to the account data). A passkey only works on the site address it was made for.
- **Sessions:** a Face ID sign-in gives the same session-only cookies as a password (asked again when the app is closed), but the cookie holds a signed token rather than the password. Set a `SESSION_SECRET` environment variable in Netlify (any long random text) to sign these with your own secret; without it the key is derived from the account list, so changing the `USERS` list signs passkey sessions out. Removing a person from the list stops their passkeys working.
- **Needs:** a device with a face or fingerprint lock set up and a recent browser (Safari 16+, Chrome, Edge, Firefox 122+), on `https`. Up to 10 passkeys per person.

The code: `netlify/lib/webauthn.mjs` (the checks), `netlify/functions/passkey.mjs` (`/api/passkey/*`), the button on the sign-in screen in `netlify/edge-functions/gate.js`, and `public/js/passkey.js` for Settings. `tests/passkey.test.mjs` runs the whole flow against a software "device" and checks that a wrong site, a stale or swapped challenge, an unverified face, a changed signature or someone else's key are all refused.

## Phones and tablets

`public/css/touch.css` (loaded last) and `public/js/touch.js` adapt the whole app for fingers:

- **Everything tappable is at least 44 × 44 points** (Apple's and Google's guidance): top-bar icons, chips, *See all*, buttons, hearts, the player and remote controls, window close buttons, and whole Settings rows (with bigger tick boxes). Taps respond at once (no double-tap-zoom delay) and buttons, cards and rows show a pressed state.
- **No zooming in on text boxes**: every search and settings box uses 16px text, which stops iPhones zooming when one is tapped.
- **Phones get a five-tab bar** (Home, Live TV, Movies, Music, **More**). More opens a sheet with Sports, TV Guide, Free Classics, Movy, My List, My Library, Search and Settings; swipe it down or tap outside to close. Tablets keep all eight tabs. Tapping the tab you're already on scrolls back to the top.
- **Page headers on phones** put the title first and the buttons in a tidy row underneath; while searching, the search box takes the logo's place instead of running off the screen.
- **Windows such as Settings are full screen on phones**, with the close button staying in reach while you scroll.
- Controls that only appeared on mouse hover (like the play button on music covers) are always shown on touch screens, and the last row of a page is never hidden behind the tab bar or the music player.

## Install on your phone

- **iPhone / iPad:** open the site in **Safari** → Share button → **Add to Home Screen**.
- **Android:** open the site in **Chrome** → ⋮ menu → **Install app** (or **Add to Home screen**).

It then opens full-screen with its own icon, like a native app.

## Updating channels

Every Netlify deploy runs `node scripts/build-channels.mjs --fetch`, which downloads the latest copy of every source (the `SOURCES` list at the top of the script: iptv-org, Free-TV, Samsung TV Plus, Pluto TV, Roku, Tubi) and rebuilds `public/data/channels.json`. A source that can't be reached falls back to its copy in `playlists/`. To add another source, add a line to `SOURCES` (and to `EXTRA` if its groups are countries). The same stream listed by two sources is kept once. To rebuild locally, or after adding `.m3u` / `.xspf` files to `playlists/`:

```bash
node scripts/build-channels.mjs          # use the playlists in the repo
node scripts/build-channels.mjs --fetch  # refresh every source first
node scripts/probe-streams.mjs           # re-check every stream (takes a while), then build again
```

## Browse by country

**Live TV opens this page.** The Live TV button (top bar and phone tab bar) goes straight to the country list, with Australia first; the old all-channels list is one tap away from the "All channels" chip.

Channels are bundled by **country / area of origin**, taken from the country code in each channel's iptv-org ID (for example `BBCOne.uk@SD` is the United Kingdom) or the country its source lists it under. That covers most of the 18,700 channels across roughly 175 countries. The rest appear under *International / Other*.

- **Countries** (top menu, or the 🌍 chip on Live TV, or the *Browse by country* row on Home): every country grouped by area (Americas, Europe, Asia, Middle East, Africa, Oceania, International), biggest first, with a find-a-country box.
- **A country's page** bundles all its channels, with category filters (News, Sports, Kids…) and **Play in VLC** to export the whole bundle as one playlist.
- Cards show the channel's flag, the player shows its country, and search understands country names (try `ukraine`).

## Apple TV look

Channels and movies use an Apple TV-style design (`public/css/apple.css`, loaded after `app.css`):
- Rounded artwork with the **title and details underneath**: 16:9 tiles for channels (logo on a soft plate, flag, LIVE tag) and 2:3 posters for movies and series.
- A floating pill navigation on desktop, a frosted tab bar on phones, a large-type hero, white pill buttons, and soft hover lift.
- Cards with the `apple` class use the new layout; older cards (personal library, link cards) keep their layout.

**Movie and series artwork.** The movie data has no artwork of its own, so posters (and the backdrop on the Movies hero) come from [TMDB](https://www.themoviedb.org) through `public/js/artwork.js`. It works on every device with no setup, using the TMDB API key built into that file. Posters load only for the cards on screen and are remembered on the device. To use your own key instead, open *Settings → Artwork for movies & series* and paste it there (it stays on that device).

The built-in key is visible to anyone who can load the app (or read the repository), which is normal for a read-only TMDB key. If it's ever misused, create a new key on TMDB and replace `BUILT_IN_KEY` in `artwork.js`. This product uses the TMDB API but is not endorsed or certified by TMDB.

## Back button

Every page except Home has a **Back** button at the left of the top bar. It goes to the previous page in the app (including after a reload), or to Home when there isn't one, for example when the app was opened straight on a page or from a shared link. The browser's own back button and swipe-back still work and keep it in step.

## The live player

Live channels play in StreamBox's own player (`live-mode` in `public/js/app.js`):

- **Full screen that works on phones, tablets and computers:** the whole player goes full screen, so the controls stay on screen (on Android it also locks to landscape; iPhone only allows the video itself, so it uses that). There's a full-screen button at the top and at the bottom of the player, and double-tap or double-click or `F` also work. On phones and tablets, **channels open straight into full screen** (Settings → *Full screen & AirPlay* turns this on or off, and it's off by default on computers). The top bar also has a button to take the whole app full screen on computers, Android and iPad (`F` does it too when no video is open). The player is sized to the visible screen (`100dvh`) and respects notches and the home bar, so the controls are never cut off.
- **AirPlay:** in Safari on iPhone, iPad and Mac an **AirPlay** button appears in the player when an Apple TV or AirPlay speaker is on the same Wi-Fi, and lights up while it's sending. Safari now plays channels with its own HLS player, which is what AirPlay needs (it also skips the CORS limit, so more channels work). Chrome and Edge can't AirPlay. Channels that go through your proxy, or that need VLC, can't be sent.
- **Skips channels that don't load:** if a channel won't start, the player moves on by itself to the next channel in the same country (in the direction you were going), and the banner says which ones it skipped. It gives up after 6 in a row and says so. Each attempt waits at most 10 seconds for a picture. A stream that drops after it was playing (a server hiccup, or a phone changing networks) reconnects once by itself. *Settings → When a channel won't load, go to the next one by itself* turns skipping off.
- **AirPlay for your own videos:** when a video from **My Library** is playing, an AirPlay button also appears at the top of the movie player (same rule: Safari, with an Apple TV or AirPlay speaker nearby). It can't be offered for a film that plays inside another site's frame (the Movies and Movy tabs), because the browser doesn't let StreamBox reach a video inside someone else's frame.
- **Controls:** play/pause (resumes at the live edge), mute and volume (remembered; iPhone/iPad use the hardware buttons), picture-in-picture where the browser supports it, channel up/down, and a buffering spinner.
- **Gestures and keys:** tap shows or hides the controls, double-tap or double-click is full screen, swipe down closes. On a computer: click or `Space`/`K` plays and pauses, `F` is full screen, `M` mutes, `Esc` closes (see the remote below for the channel keys).
- **Subtitles:** a **CC** button in the bottom bar (or `C`) switches subtitles and closed captions on and off. If a channel offers more than one (for example English and French), it opens a short menu. The button lights up while subtitles are showing, and your choice (on or off, and the language) is remembered for the next channel. It covers subtitle tracks listed in the stream's playlist and captions carried inside the stream; many channels have none, and then the button says so. Captions move up out of the way of the control bar. The logic is in `public/js/subtitles.js`.
- Movies and personal-library videos keep their own layout and are not affected.
- `node --test tests/*.test.mjs` covers the rest of the app; the player was checked in a real browser at phone, tablet and desktop sizes.

## Channel remote (zapping by country)

While a channel is playing it works like a TV remote. Channels are grouped by **country** (Australia first, then alphabetical, with "International / Other" last), and the logic is in `public/js/zapper.js` (tested in `tests/zapper.test.mjs`).

| Remote | Keyboard | What it does |
|---|---|---|
| **CH ▲ / ▼** (on-screen d-pad) | `↑` / `↓`, `Page Up` / `Page Down`, `Channel Up/Down` keys | Next / previous channel in the same country, wrapping round and skipping channels that failed |
| **◀ / ▶** | `←` / `→` | Previous / next country, landing on the channel you last watched there |
| **List (OK)** or the list button at the top | `Enter`, `G` | Opens the channel list: a strip of countries to pick from and every channel in that country, numbered, with the one playing highlighted. It stays open so you can keep changing channels; tap the picture, `×`, or `Esc` to put it away |
| digits | `0`-`9`, then `Enter` (or just wait) | Go straight to that channel number in the current country |
| | `Backspace` or `L` | Last channel (flip between the two most recent) |

Inside the list, `↑`/`↓` move through the channels, `←`/`→` browse other countries without changing what's playing, and `Enter` plays the highlighted one. A banner shows the channel's number, name, country and what's on now each time you change. On phones the list is a sheet from the bottom and the d-pad sits above the controls.

## TV Guide (Australia)

**Live TV → TV Guide** (`#guide`, also a chip on the Countries page and the Australia page) is a programme guide for Australian channels: one row per channel with what's **on now** (with a progress bar and finish time) and what's next, scrolling sideways. Tap a programme for its description and times; tap **Watch** to play the channel (the ones StreamBox has a stream for come first, and a chip narrows the list to only those). A search box finds a channel.

- **Data:** the free XMLTV guide from [i.mjh.nz](https://i.mjh.nz) (free-to-air and streaming channels, refreshed through the day), loaded straight in the browser with the app's existing XMLTV reader. It's about 0.8 MB compressed and is fetched when the app starts, so channel cards and the player also show **Now / Next** for the Australian channels that match. Times show in your device's time zone.
- **City:** the guide is per capital city (Sydney is the default). Change it on the guide page or in *Settings → TV guide*; **Off** turns the built-in guide off. State feeds the app lists separately (ABC TV VIC, Channel 9 Perth…) only get data when they match the chosen city.
- **Limits:** some channels have no programme data from this source (for example Sky Racing, Sky News and ausbiz), and some app channels have no guide channel; those simply show no Now / Next. The guide covers roughly the next 36 hours. The code is in `public/js/tv-guide.js` (tested in `tests/tv-guide.test.mjs`) and `public/css/guide.css`.
- Guides you add yourself in Settings still work and are merged in.

## Music

**Music** (`#music`, in the top bar and the phone tab bar) is laid out the way Apple Music is:

- **Listen Now** – shelves in priority order: **Today's Top Songs · Australia** (Apple Music's real chart; *See all* shows the numbered Top 100), Featured playlists (YouTube Music), Playlists on Audius, Trending on Audius, Radio Stations, More Playlists on Audius, Underground, Top Pop / Electronic / Hip-Hop / Rock, Creative Commons Picks, Live Concerts, and Browse by Genre.
- **Browse** – 22 genre tiles. A genre page gathers that genre from every source: top songs (with Play and Shuffle), Creative Commons picks, radio, and netlabel albums.
- **Radio** – SomaFM's commercial-free channels with their logos, Australian stations first, then stations by genre or by name.
- **Library** – your favourites: tap the ♥ on any song or station. Saved to the signed-in person's account, so each person has their own and it follows them to their other devices.
- **Search** – artists (round pictures), songs, playlists, Creative Commons songs, stations, and albums & concerts in one go.
- **Playlist, album and artist pages** – big artwork, Play / Shuffle, and an Apple-style song list. Artist pages show the artist's own cover photo and picture, with a tick when Audius has verified them.

**Where the music comes from** (all open, no API keys):

| Source | What it gives |
|---|---|
| Spotify | **Chart and YouTube songs play through Spotify.** Once someone connects Spotify (*Connect Spotify* on the Music page; needs **Spotify Premium**), StreamBox remote-controls the Spotify app through Spotify's official Web API (Spotify Connect): you pick songs in StreamBox, the Spotify app on the same device plays them in the background, and StreamBox shows Now Playing with the artwork, play / pause, skip, scrubbing and progress ("Playing through Spotify on <device>"). The song and the ones after it go to Spotify as one list, so it carries on by itself with the screen off. If the Spotify app isn't running, Now Playing asks you to open it once and then carries on when you come back. Until Spotify is connected, songs open in the Spotify app instead. The switch at the top (*Songs play in StreamBox*) plays them in YouTube's own player here instead. Spotify's sound never passes through StreamBox: Spotify doesn't allow that, and an iPad doesn't let one app play another's audio |
| Apple Music charts | Today's Top Songs: Apple's official most-played chart for Australia (`rss.marketingtools.apple.com`), refreshed daily, with official artwork. Each song plays **in full** in YouTube's own player, matched by title and artist (live versions, remixes and covers are passed over). The best few uploads are kept, so if the owner of one (often the official video) has switched off playing it on other sites, the next one (usually YouTube Music's official audio) plays. If a phone stops the player starting by itself, Now Playing opens with the player and one tap on it starts the song. A song with no playable upload is played from Audius if the same artist published it there, otherwise skipped. No 30-second previews |
| YouTube Music | Search and playlists, first in every list — reached the same way the [Open-Source-Music-Streaming-Apps](https://github.com/chayotic/Open-Source-Music-Streaming-Apps) apps do it, through community Piped and Invidious instances fronted by the site's `/api/music-yt` function |
| [Audius](https://audius.co) | Songs, playlists and artists, published by the artists themselves |
| [Openverse](https://openverse.org) | Creative Commons songs (Jamendo's catalogue), searched by genre |
| [Internet Archive](https://archive.org/details/etree) | Live concerts (the Live Music Archive) and netlabel albums |
| [SomaFM](https://somafm.com) | About 50 listener-supported radio channels |
| [Radio Browser](https://www.radio-browser.info) | Community directory of internet radio; only `https` streams are listed |

**Artwork** is always the official picture the artist, label or station published with the music: the track or playlist cover and the artist's picture from Audius (the largest size on the Now Playing and lock screens), the album cover from Jamendo, the station's logo from SomaFM, and the Archive's image for a recording. Nothing is guessed or matched from elsewhere, so a few items have no picture and show a note icon.

**Player, made for phones and tablets.** A mini player stays above the tab bar while you use the rest of the app. Tap it for **Now Playing**: full-screen artwork over a blurred backdrop, a scrubber, large previous / play / next buttons, ♥, and **Up Next** (beside the artwork on tablets, below it on phones). Swipe down or tap the chevron to put it away.

**Screen off.** Music keeps playing when the phone is locked or the app is in the background: it plays through a single audio element, and the phone's lock screen and notification shade show the song, its artwork and play / pause / next / previous / scrub controls (the Media Session API). The next song starts by itself while locked, and a radio station that drops out on a patchy connection is reconnected. On iPhone and iPad this works in Safari and in the app added to the Home Screen; opening a TV channel or a video pauses the music.

The code is `public/js/music.js` (sources, favourites, player), `public/js/music-ui.js` (pages, mini player, Now Playing), `public/css/music.css`, `netlify/functions/music-yt.mjs` (the YouTube Music backend and the Apple chart; it never hands out audio addresses: songs play in YouTube's embedded player) and `netlify/lib/account-data.mjs`, with tests in `tests/music.test.mjs` and `tests/music-yt.test.mjs`. Openverse allows a couple of hundred anonymous searches a day per network, so its answers are kept for six hours. The [Open-Source-Music-Streaming-Apps](https://github.com/chayotic/Open-Source-Music-Streaming-Apps) list that prompted the page is a catalogue of separate apps; StreamBox now uses the YouTube Music backends those apps use, kept behind the site's own function and prioritised over the open sources, so a failing instance never breaks the page.

## Why some channels don't play in the app (and what fixes each)

A browser is stricter than VLC. When a channel shows "Channel unavailable", the message now says why:

| Reason shown | Cause | Fix |
|---|---|---|
| `blocked or unreachable (likely CORS)` | the stream's server doesn't allow web pages to read it | the **stream proxy** (below). On Android Chrome and Safari the app also retries with the browser's own HLS player, which doesn't need CORS |
| `HTTP 403` / `HTTP 404` | region-locked, or the channel is offline | none from the app. The channel is hidden on that device for 12 hours; try another |
| `no video after 15s` / `media error` | wrong codec for the browser, or a dead stream | open in VLC |
| (VLC badge) | needs custom headers, or plain `http://` | the stream proxy, or open in VLC |

What the app does to help:
- **Hides what can't play.** The probe (`scripts/probe-streams.mjs`) classifies every channel: *verified* (loads fine), *needs a proxy* (live, but its server sends no CORS header), or *dead* (404). It also **rescues channels**: an `http://` stream whose server answers on `https://` too is switched to https (the app can only play https), and a channel listed with a special user agent or referrer is tried without them, so if it loads anyway it stops being VLC-only. The last run (November 2026) found 8,204 verified, 3,083 that need a proxy and 582 dead; it switched 142 streams to https and cleared 270 from VLC-only. Without a proxy, the Live TV lists show only channels that can play on your device and say how many more need VLC or a proxy. Dead channels are never listed. On phones (iOS/Android) the platform's own HLS player ignores CORS, so those "needs a proxy" channels are offered there.
- **Verified first**, plus a **Verified** chip on Live TV.
- **Playback fallback chain:** direct, then the browser's own HLS player, then your proxy, each only when needed. A CORS block now fails instantly with a plain explanation, a **Set up proxy** button and **Next working channel**.
- **Learns on your device:** channels that fail are hidden for 12 hours (Settings → show them again).
- **Stream proxy** (`proxy/`, see its README): the way to get *every* channel playing inside the app. On a desktop, `npm run proxy` and **Settings → Stream proxy → This computer** is the quickest way to try it.

For a native phone app, wrapping this site with [Capacitor](https://capacitorjs.com) lets it use the phone's own HTTP and HLS player, which ignore CORS entirely.

## Playing VLC-only channels

About 770 channels can't play in a browser: they use plain `http://`, or they need a custom user-agent/referrer. Browsers can't embed VLC or send those headers, so StreamBox hands them to the VLC app:

- **Open in VLC** (iPhone/Android): opens the channel straight in the VLC app. This is automatic when you tap one, unless you turn it off in Settings.
- **Open in VLC (.m3u file):** a playlist that carries each channel's required headers. It uses the share sheet on phones and downloads on a computer. Use it if the direct link fails or on Windows/Mac/Linux.
- **Play this list in VLC** (Live TV and My List pages): exports the current list (up to 3,000 channels) as one `.m3u`.
- **Try in browser anyway** for header-protected https channels that might work without the headers.
- The Live TV **VLC only** chip lists just these channels (turn on *Show channels that only play in VLC* in Settings).

## Notes and limits

- **Some channels only play in VLC.** About 770 channels use plain `http://` or need custom headers. Browsers block both on a secure (https) site. These channels are hidden by default. Turn on **Settings → Show channels that only play in VLC** to list them (see *Playing VLC-only channels*).
- **Geo-blocking:** SKY Racing only plays from Australia. Many other channels are region-locked too. If a stream fails, the player shows an error and offers the next channel.
- Free IPTV channels go up and down all the time. A channel that's offline today may work tomorrow.

## Run locally

```bash
cd public && python3 -m http.server 8080
# open http://localhost:8080
```

## Movies

The **Movies** tab includes 13 movie collections from [KiduyuTv](https://github.com/kiduyu-klaus/KiduyuTv_final), bundled in `public/data/movies.json`. Browsing uses local title artwork and descriptions, with no TMDB API, images or detail links. TV entries and unreleased movies are excluded. Search finds movies as well as channels; movies can be saved to **My List** and recently opened titles appear in **Continue Watching**.

Open a movie and tap **Play** to load a video provider inside StreamBox. **Source** switches between VidLink, MoviesAPI, Videasy and VidNest, using the movie URL templates declared by KiduyuTv. Detected missing titles, video errors and stalled playback advance to the next untried source. **Try next source** lets you report an unavailable player manually; **Retry sources** appears after the list is exhausted. The updated companion helper (v1.1+) observes cross-origin native video failures and requests autoplay once when ready; browser policies may still require pressing Play. Paused/seeking videos are preserved. VidLink also supplies progress events directly; other providers require the helper for automatic detection. An unsupported nested player requires manual switching. **Playing** is shown only when video time advances. **Open source** opens the selected provider in another tab if it cannot be embedded. These are external services: availability varies by title, region and browser, and a catalog entry does not guarantee a working video. StreamBox does not host film files. Playback position inside a provider is controlled by that provider.

To regenerate the catalog, run `npm run build:movies`. The importer fetches the pinned upstream revision recorded in the script and catalog; normal site builds use the bundled catalog. For a local checkout of that revision, run `node scripts/build-movies.mjs --source /path/to/KiduyuTv_final`.

## Free Classics

**Movies → Free Classics** (`#classics`, a banner at the top of the Movies page) adds hundreds of complete feature films that are in the **public domain**, from the [Internet Archive](https://archive.org/details/feature_films): shelves for Most Watched, Comedy, Film Noir & Crime, Sci-Fi & Horror, Silent Films, Westerns, Adventure, and Mystery & Thrillers (each "See all" shows up to 120), plus search. A film's page has its poster, year, length and description.

- **Only public domain:** every search asks the Archive for films it marks with a public-domain licence, so nothing else is listed. Old adult exploitation reels are left out.
- **Plays in StreamBox's own player** (not someone else's embedded player): resume where you left off, full screen and the AirPlay button all work. Each film offers the full-quality file and a smaller one that saves mobile data.
- The code is `public/js/classics.js` and `public/css/classics.css`, with tests in `tests/classics.test.mjs`. No key is needed.

## Automatic movie updates

StreamBox checks for new movies whenever it opens and every 24 hours while it stays open. Returning to the app checks whether an update is due; reconnecting retries immediately. **Settings → Movie updates → Check for new movies** runs a manual check and shows the result.

Updates check the latest KiduyuTv revision and fetch its 13 collections from that exact revision. Unchanged lists are downloaded at most once per UTC day, so newly released entries can appear even without a new upstream commit. The existing Movy metadata service supplies up to 60 recently released films per check, shown in **New Movies** on Home and in Movies. This collection retains up to 1,000 titles; the Movy tab still provides its full paginated catalog.

The catalog is cached on the device for offline browsing. Existing curated titles and saved movie bookmarks are retained. Failed sources retry after an hour without discarding the available catalog; if device storage is unavailable, updates remain available for that session. Offline browsing does not make external videos available offline, and new catalog entries still depend on provider playback availability.

The app cannot reliably check while it is closed. Opening it again catches up; no redeploy is required for these device updates.

## Movy and protected Vidy playback

The **Movy** tab brings the public Movy catalogs into StreamBox: movies, TV shows, anime and the 4K library. Search, genres, sorting and pagination fetch live metadata; details include TV seasons and anime episodes. Titles can be saved to My List. The 4K search filters the current page; movie/TV APIs limit browsing to 500 pages. Anime starts with trending/airing titles and offers search and genres. Two upstream anime genres with unavailable endpoints are omitted.

Catalog pages use StreamBox controls and local title artwork, without loading Movy's page scripts. Metadata comes from Movy's public services (including TMDB-compatible identifiers), with AniList used to map anime playback IDs. Film files are streamed by external providers, not copied into this repository. Availability and successful playback depend on those providers.

Movy catalog and title pages offer a direct **Download playback helper** ZIP link and installation instructions. The installation page also provides the supplied v1.0 manifest, rules and README as individual reference downloads; the complete v1.1+ ZIP includes all required scripts.

**Browser box (no helper needed).** The Movy section embeds an in-app browser panel — address bar, back/forward/reload/home, a **Find a working server** button and a **Fullscreen** button — restricted to Movy and its playback providers (movy.sx, vidy.st, vidlink.pro, moviesapi.to, videasy.net, vidnest.fun). Open it from any Movy catalog or title page ("Open in Browser box"), or from the player when protection is missing. When you open or navigate to a title page, the box automatically searches the playback servers (Vidy, VidLink, Vidnest, Videasy, MoviesAPI) for one that actually plays the video before it plays; it skips servers that report unavailable and stops at the first working one ("server found" in the toolbar). Fullscreen expands the whole box using the browser's Fullscreen API and exits with the same button or Esc. The box forwards playback-state messages from the helper when installed, so the toolbar shows Playing/Paused/Ready like the main player.

**Automatic helper setup.** "Set up helper & auto-play" on Movy pages (and on the player's protection message) opens a wizard: one-click helper download, copy/open of `chrome://extensions` or `edge://extensions`, Developer mode and Load unpacked steps, then a live detection loop that polls every couple of seconds. When the helper is detected, the page flips to **Playback protection active** and the picked movie or episode starts by itself — no reload. Title pages also keep checking in the background, so a helper installed while browsing activates without a reload. Browsers do not allow a web page to install extensions unattended, so the three manual steps remain, but everything after them is automated.

**Vidy Play requires the companion Chrome/Edge desktop extension (v1.1+).** In the app, open **Download & install playback protection**, download and extract the archive, enable Developer mode in `chrome://extensions` or `edge://extensions`, and choose **Load unpacked**. Select the extracted folder containing `manifest.json`, then reload StreamBox. See [extension instructions](browser-extension/README.md) for custom domains and supported browsers.

The extension blocks known advertising hosts, popups and top-level diversions originating from Movy/Vidy and the four movie providers while allowing playback API/media/subtitle traffic. Its observer reports playback state locally to help find a working source. Movy movies try Vidy followed by those four movie sources; TV/anime retain their Vidy embeds. Vidy rejects iframe sandboxing. The app therefore checks the extension before enabling Play and again before opening a player. These bounded rules cannot guarantee blocking every future ad or an ad embedded in a video. Desktop Chrome/Edge is supported; mobile browsers without extension support can browse the catalog but cannot use protected Vidy playback.

Run `npm test` for catalog validation, stale-request cancellation and protection component checks. These checks do not prove external video playback or replace installing and testing the extension in a supported browser.

After editing the extension, run `npm run build:extension` (Python 3 standard library) to refresh the downloadable ZIP served by the app.

## Australian channel directory

**Home → Australia** or **Live TV → Australia** lists all 391 entries from [WebGrab+Plus’s OzTiVo configuration](https://github.com/awiouy/webgrabplus/blob/master/config/siteini.pack/Australia/oztivo.net.channels.xml), including regional feeds and historical names. Search by name, region or guide ID and download the imported directory.

This source contains channel names and guide IDs, with no video URLs or programme schedules. Entries display **Stream not supplied** until a bundled or added playlist has a stream with an exact matching `tvg-id` (the entry’s guide ID or site ID). The app does not infer regional streams from similar names. Add M3U playlists and a separate XMLTV schedule through Settings. Existing stream/proxy/VLC handling applies to matched streams.

The source XML is bundled in `channel-sources/`, pinned to upstream commit `30c4f48f5b92d699d189133fcc8de4f4db952177`. Run `npm run build:australia` (Python 3 standard library) to regenerate `public/data/australia.json`; site builds retain this bundled directory.
