import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { listOptions, preferred } = createRequire(import.meta.url)('../public/js/subtitles.js');

const text = (kind, label, language = '') => ({ kind, label, language });

test('nothing is offered when a stream has no subtitles', () => {
  assert.deepEqual(listOptions(), []);
  assert.deepEqual(listOptions({ textTracks: [text('metadata', 'x'), text('chapters', 'y')] }), []);
});

test('HLS subtitle tracks and in-stream captions are listed together, with readable names', () => {
  const o = listOptions({
    hlsTracks: [{ name: 'English', lang: 'en' }, { name: '', lang: 'fr' }, { name: '', lang: '' }],
    textTracks: [text('subtitles', 'English', 'en'), text('captions', 'CC1', ''), text('captions', '', ''), text('metadata', 'ignored')],
  });
  assert.deepEqual(o.map(x => [x.source, x.label]), [['hls', 'English'], ['hls', 'French'], ['hls', 'Subtitles 3'], ['text', 'CC1'], ['text', 'Captions 2']]);
  assert.deepEqual(o.filter(x => x.source === 'hls').map(x => x.id), [0, 1, 2]);
});

test('a track hls.js is already showing is not listed twice', () => {
  const o = listOptions({ hlsTracks: [{ name: 'Español', lang: 'es' }], textTracks: [text('subtitles', 'Español', 'es')] });
  assert.equal(o.length, 1);
  assert.equal(o[0].source, 'hls');
});

test('tracks left on the video by an earlier channel are ignored while hls.js is playing', () => {
  const stale = [text('subtitles', 'English', 'en'), { ...text('captions', 'CC1', ''), cues: [] }];
  assert.deepEqual(listOptions({ hlsTracks: [], textTracks: stale, hlsActive: true }), [], 'no subtitles on this channel');
  const live = { ...text('captions', 'CC1', ''), cues: [{}] };
  assert.deepEqual(listOptions({ hlsTracks: [], textTracks: [...stale, live], hlsActive: true }).map(o => o.label), ['CC1'], 'captions that are arriving still count');
  assert.equal(listOptions({ textTracks: stale }).length, 2, 'natively (Safari) the browser resets them itself, so all are listed');
});

test('a single caption track is just called Captions', () => {
  assert.equal(listOptions({ textTracks: [text('captions', '', '')] })[0].label, 'Captions');
});

test('when subtitles are on, the last language wins, else the first track', () => {
  const o = listOptions({ hlsTracks: [{ name: 'English', lang: 'en' }, { name: 'Français', lang: 'fr' }] });
  assert.equal(preferred(o, { on: false, lang: 'fr' }), null, 'off stays off');
  assert.equal(preferred(o, { on: true, lang: 'fr' }).label, 'Français');
  assert.equal(preferred(o, { on: true, lang: 'fr-CA' }).label, 'Français', 'region is ignored');
  assert.equal(preferred(o, { on: true, lang: 'de' }).label, 'English');
  assert.equal(preferred(o, { on: true }).label, 'English');
  assert.equal(preferred([], { on: true }), null);
});
