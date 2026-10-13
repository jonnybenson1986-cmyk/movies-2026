# StreamBox

A Netflix-style player for live TV, sports and free movies. It's a static Progressive Web App (PWA), so it installs on iPhone, iPad and Android straight from the browser. You don't need an app store.

## What's inside

| Section | Source |
|---|---|
| **Live TV** (~10,000 channels) | `playlists/VLC_TV_IPTV.xspf` (iptv-org, Pluto TV, Samsung TV Plus, Tubi…), converted to `public/data/channels.json` |
| **Sports** | SKY Racing 1 & 2 (from `playlists/Sports_App_2026.html`) plus every sports channel in the playlist |
| **Movies** | Public-domain feature films from the Internet Archive (noir, comedy, westerns, horror, sci-fi, silent, cartoons) |
| **My List / Continue Watching** | Saved on the device |
| **Settings → Playlists** | Add any extra M3U playlist URL, or the full iptv-org list in one tap |

## Deploy to Netlify

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project → GitHub**.
2. Pick this repo. `netlify.toml` fills in the settings automatically (publish directory `public`, no build command).
3. Click **Deploy**. You'll get a URL like `https://your-site.netlify.app`.

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

- **Some channels only play in VLC.** About 2,100 channels use plain `http://` or need custom headers. Browsers block both on a secure (https) site. These channels are hidden by default. Turn on **Settings → Show channels that only play in VLC** to list them; each one gets an **Open in VLC** button.
- **Geo-blocking:** SKY Racing only plays from Australia. Many other channels are region-locked too. If a stream fails, the player shows an error and offers the next channel.
- Free IPTV channels go up and down all the time. A channel that's offline today may work tomorrow.

## Run locally

```bash
cd public && python3 -m http.server 8080
# open http://localhost:8080
```
