export interface RandomArtist {
  name: string;
  image: string;
}

interface ArtistTrack {
  artist?: string;
  title: string;
  thumbnail: string;
}

export function selectRandomArtists(
  tracks: ArtistTrack[],
  random: () => number = Math.random,
): RandomArtist[] {
  const uniqueArtists = new Map<string, RandomArtist>();

  for (const track of tracks) {
    const artistName = track.artist?.trim() || track.title.split(" - ")[0]?.trim() || "";
    if (!artistName) continue;

    const key = artistName.toLocaleLowerCase();
    if (!uniqueArtists.has(key)) {
      uniqueArtists.set(key, { name: artistName, image: track.thumbnail });
    }
  }

  const shuffled = [...uniqueArtists.values()];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const maxCount = Math.min(5, shuffled.length);
  const count = maxCount < 2 ? maxCount : 2 + Math.floor(random() * (maxCount - 1));
  return shuffled.slice(0, count);
}