import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MusicState, Track } from "../types";
const KEY = "streambox.music.v1";
const empty: MusicState = { playlists: [], liked: [], history: [], genreCounts: {} };
export async function loadState(): Promise<MusicState> {
  try { return { ...empty, ...(JSON.parse((await AsyncStorage.getItem(KEY)) || "{}") as Partial<MusicState>) }; }
  catch { return empty; }
}
export async function saveState(state: MusicState) { await AsyncStorage.setItem(KEY, JSON.stringify(state)); }
export function recordListen(state: MusicState, track: Track, skipped = false): MusicState {
  const genre = track.genre || "Other";
  return { ...state, history: [track, ...state.history.filter(t => t.id !== track.id)].slice(0, 100),
    genreCounts: { ...state.genreCounts, [genre]: (state.genreCounts[genre] || 0) + (skipped ? 0 : 1) } };
}
