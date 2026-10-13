# StreamBox Movy playback protection

Chrome/Edge Manifest V3 extension. Install it in the browser used to watch StreamBox:

1. Download the extension archive provided with this change and extract it, or use this repository's `browser-extension/` folder.
2. Open `chrome://extensions` (Edge: `edge://extensions`) and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Reload StreamBox. Its Movy detail pages will show **Playback protection active**.

The app connector supports localhost, 127.0.0.1, Netlify and Vercel sites. For a custom app domain, add its exact origin plus `/*` to the `connector.js` entry's `matches` array in `manifest.json`, reload the extension, then reload the app. Catalog access does not require the extension.

The extension only blocks requests initiated by Movy/Vidy. It blocks known advertising hosts, external frame/document navigations, `window.open` popups, links that open new windows or navigate outside Movy/Vidy, and specific advertising containers. Playback APIs, HLS segments, audio and subtitles are allowed. A background listener closes navigation-created popups originating from those player frames.

The integration uses Vidy's published movie/TV embed routes. The player rejects iframe sandboxing, so StreamBox requires the extension's presence before opening that player. A browser extension can enforce request and popup rules that a static web page cannot.

Limits: this is a bounded rule list, not a guarantee against every future advertising technique or inline video ad. Provider changes may require updates to `rules.json`. Signed/expired media, region locks, authentication and provider failures remain the provider's responsibility. Chrome/Edge desktop is supported; browser extension support on mobile varies. No account, cookies, history or video requests are collected or sent by this extension. The app connector exchanges only a local readiness message.

After editing extension sources, run `npm run build:extension` (requires Python 3) to regenerate the app's downloadable ZIP in `public/downloads/`.
