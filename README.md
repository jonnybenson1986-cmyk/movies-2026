# StreamBox

A Netflix-style player for live TV, sports and movies. It's a static Progressive Web App (PWA), so it installs on iPhone, iPad and Android straight from the browser. You don't need an app store.

## What's inside

| Section | Source |
|---|---|
| **Live TV** (~11,600 channels) | The [iptv-org](https://github.com/iptv-org/iptv) playlist (`playlists/iptv-org.m3u`) plus your VLC playlist (`playlists/VLC_TV_IPTV.xspf`: Pluto TV, Samsung TV Plus, Tubi…), merged into `public/data/channels.json` with logos and TV-guide IDs |
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

## Install on your phone

- **iPhone / iPad:** open the site in **Safari** → Share button → **Add to Home Screen**.
- **Android:** open the site in **Chrome** → ⋮ menu → **Install app** (or **Add to Home screen**).

It then opens full-screen with its own icon, like a native app.

## Updating channels

Every Netlify deploy runs `node scripts/build-channels.mjs --fetch`, which downloads the latest iptv-org list and rebuilds `public/data/channels.json`. If iptv-org can't be reached, the build uses the copy in `playlists/`. To rebuild locally, or after adding `.m3u` / `.xspf` files to `playlists/`:

```bash
node scripts/build-channels.mjs          # use the playlists in the repo
node scripts/build-channels.mjs --fetch  # refresh iptv-org first
```

## Browse by country

Channels are bundled by **country / area of origin**, taken from the country code in each channel's iptv-org ID (for example `BBCOne.uk@SD` is the United Kingdom). That covers about 11,200 of the 11,600 channels across roughly 175 countries. The rest appear under *International / Other*.

- **Countries** (top menu, or the 🌍 chip on Live TV, or the *Browse by country* row on Home): every country grouped by area (Americas, Europe, Asia, Middle East, Africa, Oceania, International), biggest first, with a find-a-country box.
- **A country's page** bundles all its channels, with category filters (News, Sports, Kids…) and **Play in VLC** to export the whole bundle as one playlist.
- Cards show the channel's flag, the player shows its country, and search understands country names (try `ukraine`).

## Why some channels don't play in the app (and what fixes each)

A browser is stricter than VLC. When a channel shows "Channel unavailable", the message now says why:

| Reason shown | Cause | Fix |
|---|---|---|
| `blocked or unreachable (likely CORS)` | the stream's server doesn't allow web pages to read it | the **stream proxy** (below). On Android Chrome and Safari the app also retries with the browser's own HLS player, which doesn't need CORS |
| `HTTP 403` / `HTTP 404` | region-locked, or the channel is offline | none from the app. The channel is hidden on that device for 12 hours; try another |
| `no video after 15s` / `media error` | wrong codec for the browser, or a dead stream | open in VLC |
| (VLC badge) | needs custom headers, or plain `http://` | the stream proxy, or open in VLC |

What the app does to help:
- **Hides what can't play.** The probe (`scripts/probe-streams.mjs`) classifies every channel: *verified* (loads fine), *needs a proxy* (live, but its server sends no CORS header), or *dead* (404). Without a proxy, the Live TV lists show only channels that can play on your device and say how many more need VLC or a proxy. Dead channels are never listed. On phones (iOS/Android) the platform's own HLS player ignores CORS, so those "needs a proxy" channels are offered there.
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

## Automatic movie updates

StreamBox checks for new movies whenever it opens and every 24 hours while it stays open. Returning to the app checks whether an update is due; reconnecting retries immediately. **Settings → Movie updates → Check for new movies** runs a manual check and shows the result.

Updates check the latest KiduyuTv revision and fetch its 13 collections from that exact revision. Unchanged lists are downloaded at most once per UTC day, so newly released entries can appear even without a new upstream commit. The existing Movy metadata service supplies up to 60 recently released films per check, shown in **New Movies** on Home and in Movies. This collection retains up to 1,000 titles; the Movy tab still provides its full paginated catalog.

The catalog is cached on the device for offline browsing. Existing curated titles and saved movie bookmarks are retained. Failed sources retry after an hour without discarding the available catalog; if device storage is unavailable, updates remain available for that session. Offline browsing does not make external videos available offline, and new catalog entries still depend on provider playback availability.

The app cannot reliably check while it is closed. Opening it again catches up; no redeploy is required for these device updates.

## Movy and protected Vidy playback

The **Movy** tab brings the public Movy catalogs into StreamBox: movies, TV shows, anime and the 4K library. Search, genres, sorting and pagination fetch live metadata; details include TV seasons and anime episodes. Titles can be saved to My List. The 4K search filters the current page; movie/TV APIs limit browsing to 500 pages. Anime starts with trending/airing titles and offers search and genres. Two upstream anime genres with unavailable endpoints are omitted.

Catalog pages use StreamBox controls and local title artwork, without loading Movy's page scripts. Metadata comes from Movy's public services (including TMDB-compatible identifiers), with AniList used to map anime playback IDs. Film files are streamed by external providers, not copied into this repository. Availability and successful playback depend on those providers.

Movy catalog and title pages offer a direct **Download playback helper** ZIP link and installation instructions. The installation page also provides the supplied v1.0 manifest, rules and README as individual reference downloads; the complete v1.1+ ZIP includes all required scripts.

**Vidy Play requires the companion Chrome/Edge desktop extension (v1.1+).** In the app, open **Download & install playback protection**, download and extract the archive, enable Developer mode in `chrome://extensions` or `edge://extensions`, and choose **Load unpacked**. Select the extracted folder containing `manifest.json`, then reload StreamBox. See [extension instructions](browser-extension/README.md) for custom domains and supported browsers.

The extension blocks known advertising hosts, popups and top-level diversions originating from Movy/Vidy and the four movie providers while allowing playback API/media/subtitle traffic. Its observer reports playback state locally to help find a working source. Movy movies try Vidy followed by those four movie sources; TV/anime retain their Vidy embeds. Vidy rejects iframe sandboxing. The app therefore checks the extension before enabling Play and again before opening a player. These bounded rules cannot guarantee blocking every future ad or an ad embedded in a video. Desktop Chrome/Edge is supported; mobile browsers without extension support can browse the catalog but cannot use protected Vidy playback.

Run `npm test` for catalog validation, stale-request cancellation and protection component checks. These checks do not prove external video playback or replace installing and testing the extension in a supported browser.

After editing the extension, run `npm run build:extension` (Python 3 standard library) to refresh the downloadable ZIP served by the app.

## Australian channel directory

**Home → Australia** or **Live TV → Australia** lists all 391 entries from [WebGrab+Plus’s OzTiVo configuration](https://github.com/awiouy/webgrabplus/blob/master/config/siteini.pack/Australia/oztivo.net.channels.xml), including regional feeds and historical names. Search by name, region or guide ID and download the imported directory.

This source contains channel names and guide IDs, with no video URLs or programme schedules. Entries display **Stream not supplied** until a bundled or added playlist has a stream with an exact matching `tvg-id` (the entry’s guide ID or site ID). The app does not infer regional streams from similar names. Add M3U playlists and a separate XMLTV schedule through Settings. Existing stream/proxy/VLC handling applies to matched streams.

The source XML is bundled in `channel-sources/`, pinned to upstream commit `30c4f48f5b92d699d189133fcc8de4f4db952177`. Run `npm run build:australia` (Python 3 standard library) to regenerate `public/data/australia.json`; site builds retain this bundled directory.
