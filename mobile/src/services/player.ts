import TrackPlayer, { Capability, RepeatMode, AppKilledPlaybackBehavior } from "react-native-track-player";
import type { Track } from "../types";
let ready = false;
export async function setupAuthorizedAudioPlayer() {
  if (ready) return;
  await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
  await TrackPlayer.updateOptions({
    android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback },
    capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo],
    compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext]
  });
  ready = true;
}
export async function playAuthorizedQueue(tracks: Track[], startIndex = 0) {
  if (tracks.some(t => t.source !== "authorized" || !t.audioUrl)) {
    throw new Error("Background audio requires an authorized playable audio URL. YouTube catalogue IDs are not audio URLs.");
  }
  await setupAuthorizedAudioPlayer();
  await TrackPlayer.reset();
  await TrackPlayer.add(tracks.map(t => ({ id: t.id, url: t.audioUrl!, title: t.title, artist: t.artist, artwork: t.artwork })));
  await TrackPlayer.skip(startIndex);
  await TrackPlayer.play();
}
export async function setRepeat(enabled: boolean) { await TrackPlayer.setRepeatMode(enabled ? RepeatMode.Queue : RepeatMode.Off); }
