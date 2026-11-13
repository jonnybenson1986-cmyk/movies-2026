// The Spotify Client ID for remote control (public/js/spotify.js). A Client ID is not a secret: the sign-in uses
// PKCE, so no client secret is needed or stored. Set SPOTIFY_CLIENT_ID in Netlify's environment variables; until then
// the Music page lets someone paste one in on their device. The gate keeps this behind the StreamBox sign-in.
const env = key => globalThis.Netlify?.env?.get?.(key) ?? globalThis.process?.env?.[key] ?? '';

export default async function spotifyConfig() {
  const id = String(env('SPOTIFY_CLIENT_ID') || '').trim();
  return new Response(JSON.stringify({ clientId: /^[0-9a-f]{32}$/i.test(id) ? id : '' }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export const config = { path: '/api/spotify-config' };
