import type { Track } from "../types";
const API = process.env.EXPO_PUBLIC_OPENTUNE_API_URL || "https://streambox-opentune.onrender.com";
type Row = { videoId: string; title: string; artist?: string; duration?: string; thumbnail?: string };
export async function searchOpenTune(query: string): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];
  const response = await fetch(`${API}/api/search?q=${encodeURIComponent(q)}`);
  if (!response.ok) throw new Error("OpenTune search is temporarily unavailable.");
  const payload = await response.json() as { results?: Row[] };
  return (payload.results || []).filter(x => x.videoId).map(x => ({
    id: `yt:${x.videoId}`, title: x.title, artist: x.artist || "Unknown artist",
    artwork: x.thumbnail, duration: parseDuration(x.duration), source: "youtube"
  }));
}
function parseDuration(value?: string) {
  if (!value) return undefined;
  return value.split(":").map(Number).reduce((n, part) => n * 60 + part, 0);
}
