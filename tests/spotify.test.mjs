import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sp = require('../public/js/spotify.js');
const m = require('../public/js/music.js');
const { default: spotifyConfig } = await import(new URL('../netlify/functions/spotify-config.mjs', import.meta.url));

const track = (id, name, artists, extra = {}) => ({ uri: `spotify:track:${id.padEnd(22, 'a')}`, name, artists: artists.map(n => ({ name: n })), duration_ms: 190000, album: { images: [{ url: 'https://i.scdn.co/small.jpg', width: 64 }, { url: 'https://i.scdn.co/big.jpg', width: 640 }] }, ...extra });

test('the sign-in uses PKCE with the scopes remote control needs, and comes back to this site', async () => {
  const u = new URL(sp.authUrl({ clientId: 'a'.repeat(32), redirect: sp.redirectUri('https://movies.example'), challenge: 'abc', state: 'xyz' }));
  assert.equal(u.origin + u.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://movies.example/spotify-callback.html');
  assert.deepEqual(u.searchParams.get('scope').split(' ').sort(), ['user-modify-playback-state', 'user-read-currently-playing', 'user-read-playback-state']);
  assert.equal(u.searchParams.has('client_secret'), false, 'no secret is ever used');
  // RFC 7636's own example: the challenge is the SHA-256 of the verifier, base64url without padding
  assert.equal(await sp.challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.ok(sp.validClientId('0123456789abcdef0123456789ABCDEF'));
  for (const bad of ['', 'abc', 'x'.repeat(32), '0123456789abcdef0123456789abcdef0']) assert.ok(!sp.validClientId(bad), bad);
});

test('the device chosen is the one already playing, else this kind of device', () => {
  const d = (id, type, extra = {}) => ({ id, type, name: id, ...extra });
  assert.equal(sp.pickDevice([d('pc', 'Computer'), d('ipad', 'Tablet')], 'Tablet').id, 'ipad');
  assert.equal(sp.pickDevice([d('pc', 'Computer'), d('ipad', 'Tablet'), d('tv', 'TV', { is_active: true })], 'Tablet').id, 'tv', 'whatever is already playing wins');
  assert.equal(sp.pickDevice([d('locked', 'Tablet', { is_restricted: true }), d('pc', 'Computer')], 'Tablet').id, 'pc', 'restricted devices can’t be controlled');
  assert.equal(sp.pickDevice([d('', 'Tablet')], 'Tablet'), null);
  assert.equal(sp.pickDevice([], 'Tablet'), null);
});

test('songs are matched on Spotify by title and artist, never to a different song', () => {
  const item = m.chartItem({ id: '1844932152', name: 'Man I Need', artist: 'Olivia Dean', rank: 3 });
  const tracks = [track('cover', 'Man I Need', ['Karaoke Stars']), track('right', 'Man I Need', ['Olivia Dean']), track('other', 'Nice To Each Other', ['Olivia Dean'])];
  const best = sp.bestTrack(item, tracks, m.matchScore);
  assert.equal(best.uri, 'spotify:track:rightaaaaaaaaaaaaaaaaa'); assert.equal(best.art, 'https://i.scdn.co/big.jpg'); assert.equal(best.artist, 'Olivia Dean');
  assert.equal(sp.bestTrack(item, [track('other', 'Nice To Each Other', ['Olivia Dean'])], m.matchScore), null, 'a different song by the same artist is not played');
  assert.equal(sp.trackItem({ uri: 'spotify:episode:abc' }), null);
  assert.equal(sp.searchQuery('Man "I" Need', 'Olivia Dean'), 'track:Man I Need artist:Olivia Dean');
});

test('what Spotify is playing becomes Now Playing; its errors become short reasons', () => {
  const st = sp.parseState({ is_playing: true, progress_ms: 61500, device: { id: 'ipad', name: 'Jon’s iPad' }, item: track('right', 'Man I Need', ['Olivia Dean']) });
  assert.deepEqual(st, { playing: true, progress: 61.5, duration: 190, uri: 'spotify:track:rightaaaaaaaaaaaaaaaaa', name: 'Man I Need', artist: 'Olivia Dean', art: 'https://i.scdn.co/big.jpg', device: 'Jon’s iPad', deviceId: 'ipad' });
  assert.equal(sp.parseState(null), null); assert.equal(sp.parseState({ is_playing: false }), null);
  assert.equal(sp.reason(404, { error: { reason: 'NO_ACTIVE_DEVICE' } }), 'no-device');
  assert.equal(sp.reason(403, { error: { reason: 'PREMIUM_REQUIRED' } }), 'premium');
  assert.equal(sp.reason(401, {}), 'signed-out'); assert.equal(sp.reason(429, {}), 'busy'); assert.equal(sp.reason(500, {}), 'error');
});

test('the Client ID comes from Netlify’s environment, and only a well-formed one', async () => {
  const get = async value => { globalThis.Netlify = { env: { get: k => (k === 'SPOTIFY_CLIENT_ID' ? value : undefined) } }; try { return (await (await spotifyConfig()).json()).clientId; } finally { delete globalThis.Netlify; } };
  assert.equal(await get(' 0123456789abcdef0123456789abcdef '), '0123456789abcdef0123456789abcdef');
  assert.equal(await get('not-an-id'), '');
  assert.equal(await get(undefined), '');
});
