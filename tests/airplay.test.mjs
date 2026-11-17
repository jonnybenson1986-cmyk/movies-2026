// AirPlay to an Apple TV from the main player. The behaviour itself is checked in a browser with Safari's AirPlay
// functions stood in for; these keep the pieces that make it work from being lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const app = read('js/app.js'), html = read('index.html');

test('the video can be sent with AirPlay, and Apple devices play streams natively (needed for AirPlay)', () => {
  assert.match(html, /<video id="video"[^>]*x-webkit-airplay="allow"/);
  assert.doesNotMatch(html, /disableRemotePlayback|disableremoteplayback/);
  assert.match(app, /const hlsJs = !IS_IOS && !NATIVE_HLS/);
});

test('changing channel while on the Apple TV keeps the AirPlay connection', () => {
  assert.match(app, /if \(!\(keepRoute && onAirPlay\(\)\)\) \{ video\.removeAttribute\('src'\); video\.load\(\); \}/);
  assert.equal((app.match(/teardown\(\{ keepRoute: true \}\)/g) || []).length, 2, 'play() and each stream attempt');
  assert.match(app, /function closePlayer\(\) \{[\s\S]*?\n    teardown\(\);/, 'closing the player does end it');
});

test('an Apple TV gets longer to start a stream before the channel counts as failed (and is skipped)', () => {
  assert.match(app, /const wait = onAirPlay\(\) \? 30000 : 10000;/);
});

test('while on the TV: a "Playing on your TV" screen, controls stay up, lock screen and remote controls', () => {
  assert.match(html, /id="airScreen"[\s\S]*id="airChange"/);
  assert.match(html, /id="airPrompt"/);
  assert.match(app, /!onAirPlay\(\)\) player\.classList\.add\('idle'\)/);
  for (const action of ['play', 'pause', 'stop', 'nexttrack', 'previoustrack', 'seekforward', 'seekbackward']) assert.match(app, new RegExp(`on\\('${action}'`), action);
  assert.match(read('js/music.js'), /media\.addEventListener\('play', \(\) => \{ if \(current && !silent\(\)\) describe\(current\); claimSession\(\); \}\)/, 'music takes the lock screen back');
});

test('the AirPlay button is there on any browser that can AirPlay, so nobody has to fall back to Screen Mirroring', () => {
  assert.match(app, /const AIRPLAY_CAPABLE = 'WebKitPlaybackTargetAvailabilityEvent' in window && !IN_ANDROID_APP;/);
  assert.match(app, /airBtn\.hidden = !\(airplayAvailable \|\| AIRPLAY_CAPABLE\);/);
  assert.match(app, /if \(!airplayAvailable \|\| onAirPlay\(\) \|\| video\.hidden \|\| current\?\.type === 'live'\) return;/, '"Play on TV" for films and your own videos when an Apple TV is nearby, not over live TV');
  assert.match(html, /lock your phone/);
});
