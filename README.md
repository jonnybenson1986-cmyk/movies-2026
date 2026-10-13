# StreamBox

A Netflix-style player for live TV and sports. It's a static Progressive Web App (PWA), so it installs on iPhone, iPad and Android straight from the browser. You don't need an app store.

## What's inside

| Section | Source |
|---|---|
| **Live TV** (~11,600 channels) | The [iptv-org](https://github.com/iptv-org/iptv) playlist (`playlists/iptv-org.m3u`) plus your VLC playlist (`playlists/VLC_TV_IPTV.xspf`: Pluto TV, Samsung TV Plus, Tubi…), merged into `public/data/channels.json` with logos and TV-guide IDs |
| **Sports** | SKY Racing 1 & 2 (from `playlists/Sports_App_2026.html`) plus every sports channel in the playlist |
| **My List / Continue Watching** | Saved on the device |
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
