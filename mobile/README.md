# StreamBox Music — Expo mobile app

This is a separate React Native / Expo app; it does not replace the existing StreamBox PWA.

## Current capabilities
- Dark, Spotify-inspired Home / Search / Your Library tabs.
- OpenTune is the first catalogue searched via the deployed StreamBox OpenTune API.
- YouTube results open in the official YouTube embedded player.
- Local playlist and listening-preference persistence via AsyncStorage.
- A native audio playback adapter using react-native-track-player for audio URLs that you own or are licensed to stream.

## Important source and platform limits
OpenTune supplies YouTube Music catalogue metadata and video IDs. It does not provide licensed audio stream URLs. This app does not extract, download, proxy, or re-host YouTube audio. YouTube embedded playback is subject to YouTube's own playback, background and platform restrictions; it is not the app's background audio engine.

Background playback, lock-screen controls, queue preloading, and CarPlay apply to a separate authorized audio source (for example, your own media server or a licensed provider) that supplies playable audio URLs and artwork. Do not pass YouTube video IDs to Track Player as audio URLs.

Apple CarPlay audio apps require Apple's CarPlay audio entitlement and review/approval. Adding a capability string or entitlement locally does not grant access. A native iOS build, provisioning profile with the approved entitlement, and CarPlay scene integration are required. Expo Go cannot provide these native capabilities; use an EAS development/production build after configuring the native project.

## Setup
1. Install Node.js 20+ and the latest compatible Xcode (macOS required for iOS builds).
2. From this directory run `npm install`.
3. Run `npx expo install --fix` if Expo reports package-version mismatches.
4. Run `npx expo prebuild` to generate native projects.
5. Run `npx expo run:ios` or `npx expo run:android` for a development build. Expo Go is not sufficient for Track Player background services.
6. Set `EXPO_PUBLIC_OPENTUNE_API_URL` if you use a different API host. The default is the deployed StreamBox OpenTune service.
7. For authorized audio, configure your own provider endpoint and pass its HTTPS audio URL to the Track Player adapter.

## Background audio / lock screen
The project config declares iOS `UIBackgroundModes: [audio]`. Track Player must be registered in the native entry point for the generated iOS/Android project. Follow the installed version's official setup guide and verify on a physical device. The app's current YouTube embed is not a background-audio source.

## Apple CarPlay checklist
- Request Apple's `com.apple.developer.carplay-audio` entitlement for your app identifier through Apple's CarPlay program.
- Add the approved entitlement to the provisioning profile and signed app; do not self-assign it.
- Implement a `CPTemplateApplicationScene` delegate in the generated iOS target and expose approved audio browsing templates.
- Connect the CarPlay Now Playing controls to the same authorized Track Player queue.
- Test on a CarPlay simulator/head unit after entitlement approval. The starter repository includes a Swift integration note under `ios/CarPlay/README.md`; generated native files may need to be regenerated after Expo config changes.

## Scripts
- `npm start` — Expo dev server
- `npm run ios` — native iOS development build (macOS)
- `npm run android` — native Android development build

## Git hygiene
Secrets belong in local `.env` files and must never be committed. Copy `.env.example` to `.env` for local overrides.


## Sports / SmartCric
The Sports tab lists the cricket match pages currently published on SmartCric and opens the selected page inside the app using the site's own player. StreamBox does not extract stream URLs, bypass access controls, download, proxy, or re-host video. Match availability and rights are controlled by the source site; the displayed match list is a snapshot and should be refreshed against https://smartcric.ch/ when schedules change. For production distribution, verify that embedding SmartCric pages in an in-app WebView is permitted by its terms and applicable broadcast rights; otherwise open the source in the device browser or replace it with authorised broadcaster links.
