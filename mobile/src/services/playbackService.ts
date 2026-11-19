import TrackPlayer, { Event } from "react-native-track-player";
export default async function playbackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    try { await TrackPlayer.skipToNext(); await TrackPlayer.play(); } catch {}
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    try { await TrackPlayer.skipToPrevious(); await TrackPlayer.play(); } catch {}
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, event => TrackPlayer.seekTo(event.position));
}
