export type Track = {
  id: string;
  title: string;
  artist: string;
  artwork?: string;
  duration?: number;
  source: "youtube" | "authorized";
  audioUrl?: string;
  genre?: string;
};
export type Playlist = { id: string; name: string; trackIds: string[]; updatedAt: number };
export type MusicState = { playlists: Playlist[]; liked: string[]; history: Track[]; genreCounts: Record<string, number> };
