# StreamBox

A Netflix-style player for live TV, sports and free movies. It's a static Progressive Web App (PWA), so it installs on iPhone, iPad and Android straight from the browser. You don't need an app store.

## What's inside

| Section | Source |
|---|---|
| **Live TV** (~10,000 channels) | `playlists/VLC_TV_IPTV.xspf` (iptv-org, Pluto TV, Samsung TV Plus, Tubi…), converted to `public/data/channels.json` |
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

Replace or add `.xspf` files in `playlists/`, then run:

```bash
node scripts/build-channels.mjs
```

Commit the updated `public/data/channels.json` and Netlify redeploys.

## Notes and limits

- **More like this:** every TMDB movie page ends with a row of similar films from TMDB's recommendations (needs your TMDB key).
- **Some channels only play in VLC.** About 2,100 channels use plain `http://` or need custom headers. Browsers block both on a secure (https) site. These channels are hidden by default. Turn on **Settings → Show channels that only play in VLC** to list them; each one gets an **Open in VLC** button.
- **Geo-blocking:** SKY Racing only plays from Australia. Many other channels are region-locked too. If a stream fails, the player shows an error and offers the next channel.
- Free IPTV channels go up and down all the time. A channel that's offline today may work tomorrow.

## Run locally

```bash
cd public && python3 -m http.server 8080
# open http://localhost:8080
```
