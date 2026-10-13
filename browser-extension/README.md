# StreamBox movie playback helper (v1.1)

Chrome/Edge Manifest V3 extension. Install it in the browser used to watch StreamBox:

1. Download the extension archive from StreamBox's **Download & install playback protection** page and extract it, or use this repository's `browser-extension/` folder.
2. Open `chrome://extensions` (Edge: `edge://extensions`) and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Reload StreamBox. Movy detail pages will show **Playback protection active**.

If you installed v1.0, replace its files with this version and reload the extension and StreamBox. Movy now requires the updated helper before Play and each source attempt.

The app connector supports localhost, 127.0.0.1, Netlify and Vercel sites. For a custom app domain, add its exact origin plus `/*` to the `connector.js` entry's `matches` array in `manifest.json`, reload the extension, then reload the app. Catalog access does not require the extension.

## Finding a working movie source

For a movie, StreamBox tries the providers in its Source list. A detected missing title, native video error or 25 seconds of stalled attempted playback advances to an untried provider. The app only shows **Playing** after video time advances. Pausing, seeking, finishing, browser autoplay refusal and background tabs do not discard a source. The helper attempts autoplay once when media is ready; browser restrictions may require pressing the provider's Play button.

The helper observes native video state and known unavailable messages in VidLink, MoviesAPI, Videasy, VidNest and Vidy frames. It sends only the current attempt token, playback state and video time to the embedding app. An unsupported nested player cannot be inspected; use **Try next source** if it fails. After all sources have failed, **Retry sources** starts a new attempt. Local movie playback can also use VidLink's published progress events without this extension, but other providers need the helper for automatic failure detection.

Movie IDs identify the same film across providers. Movy movies use Vidy followed by the repository's four movie providers. TV/anime retain the supported Vidy embed; this change adds no alternative TV/anime provider routes.

## Protection and privacy

Rules block known advertising hosts, popups and provider-initiated top-level navigation from Movy, Vidy and the four movie providers. External subframes initiated by Movy/Vidy are blocked; the other providers' nested players remain allowed. Media APIs, HLS segments, audio and subtitles are allowed. A background listener closes navigation-created popups from those provider frames.

Vidy rejects iframe sandboxing, so StreamBox checks this extension before opening it. These are bounded rules, not a guarantee against every future ad or an ad embedded in video. Provider changes may require rule or observer updates. Authentication, region restrictions and provider outages can leave every source unavailable. No account, cookies, history or media URLs are collected or uploaded. State messages stay inside the browser.

Chrome/Edge desktop is supported; mobile extension support varies. Catalog browsing works without the helper. An iframe load alone is not proof that a movie plays.

After editing extension sources, run `npm run build:extension` (Python 3 standard library) to regenerate `public/downloads/streambox-playback-protection.zip`.
