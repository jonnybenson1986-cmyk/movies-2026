# StreamBox

A Netflix-style player for live TV, sports and free movies. It's a static Progressive Web App (PWA), so it installs on iPhone, iPad and Android straight from the browser. You don't need an app store.

## What's inside

| Section | Source |
|---|---|
| **Live TV** (~11,600 channels) | The [iptv-org](https://github.com/iptv-org/iptv) playlist (`playlists/iptv-org.m3u`) plus your VLC playlist (`playlists/VLC_TV_IPTV.xspf`: Pluto TV, Samsung TV Plus, Tubi…), merged into `public/data/channels.json` with logos and TV-guide IDs |
| **Sports** | SKY Racing 1 & 2 (from `playlists/Sports_App_2026.html`) plus every sports channel in the playlist |
| **Movies (TMDB)** | Trending, popular, top-rated, in-cinemas and genre rows with posters, ratings, trailers and "where to watch" in Australia. Needs a free TMDB API key (see below). |
| **Movies (public domain)** | Feature films from the Internet Archive (noir, comedy, westerns, horror, sci-fi, silent, cartoons) |
| **My List / Continue Watching** | Saved on the device |
| **Settings → Playlists** | Add any extra M3U playlist URL, or the full iptv-org list in one tap |

## Deploy to Netlify

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project → GitHub**.
2. Pick this repo. `netlify.toml` fills in the settings automatically (publish directory `public`, no build command).
3. Click **Deploy**. You'll get a URL like `https://your-site.netlify.app`.

## Add your TMDB key (movie posters, trailers, "where to watch")

1. Create a free account at [themoviedb.org](https://www.themoviedb.org) and go to **Settings → API**. Request a key (choose "Personal", and "Website" for the URL).
2. Copy the **API Key (v3 auth)**, the 32-character one. Don't use the "Read Access Token".
3. In StreamBox, tap the ⚙ icon → **TMDB** → paste the key → **Save**.

The key is saved only on that device (browser storage). It is never written into this repo. TMDB titles link out to the services that carry them; StreamBox doesn't play them.

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming data by JustWatch via TMDB.

## TV guide ("Now / Next")

Settings → **TV guide (XMLTV)** → add the URL of an XMLTV guide (`.xml` or `.xml.gz`, https, and it must allow cross-origin requests). Channels then show "Now: …" on their card, and the player shows "Now … · Next 8:45 PM: …". Channels match a guide by their playlist `tvg-id`, or by name. If a playlist you add declares a guide in its `#EXTM3U url-tvg="…"` header, that guide is picked up automatically. Only the next ~36 hours are kept, and guide files over 80 MB are skipped.

## Backup & restore

Settings → **Backup & restore** → **Export backup** saves a `streambox-backup.json` with My List, watch history and your playlist and guide URLs. Your TMDB key is left out unless you tick the box. **Import backup** merges a backup into the current device. Imports are filtered, so only known item types with http(s) streams are kept.

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

## Playing VLC-only channels

About 770 channels can't play in a browser: they use plain `http://`, or they need a custom user-agent/referrer. Browsers can't embed VLC or send those headers, so StreamBox hands them to the VLC app:

- **Open in VLC** (iPhone/Android): opens the channel straight in the VLC app. This is automatic when you tap one, unless you turn it off in Settings.
- **Open in VLC (.m3u file):** a playlist that carries each channel's required headers. It uses the share sheet on phones and downloads on a computer. Use it if the direct link fails or on Windows/Mac/Linux.
- **Play this list in VLC** (Live TV and My List pages): exports the current list (up to 3,000 channels) as one `.m3u`.
- **Try in browser anyway** for header-protected https channels that might work without the headers.
- The Live TV **VLC only** chip lists just these channels (turn on *Show channels that only play in VLC* in Settings).

## Notes and limits

- **More like this:** every TMDB movie page ends with a row of similar films from TMDB's recommendations (needs your TMDB key).
- **Some channels only play in VLC.** About 770 channels use plain `http://` or need custom headers. Browsers block both on a secure (https) site. These channels are hidden by default. Turn on **Settings → Show channels that only play in VLC** to list them (see *Playing VLC-only channels*).
- **Geo-blocking:** SKY Racing only plays from Australia. Many other channels are region-locked too. If a stream fails, the player shows an error and offers the next channel.
- Free IPTV channels go up and down all the time. A channel that's offline today may work tomorrow.

## Run locally

```bash
cd public && python3 -m http.server 8080
# open http://localhost:8080
```
