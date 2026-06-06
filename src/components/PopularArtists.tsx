import { useState, useEffect } from "react";
import { preloadImages } from "@/lib/imagePreloader";

const artistsData = [
  { name: "Virgoun", image: "https://i.scdn.co/image/ab67616100005174a99ec2b3bd22a84739aac218" },
  { name: "Yovie Widianto", image: "https://i.scdn.co/image/ab676161000051749adad46022570f8b8b3209a9" },
  { name: "Nadhif Basalamah", image: "https://i.scdn.co/image/ab676161000051746c95c421d7bdc60a2d980002" },
  { name: "Tulus", image: "https://i.scdn.co/image/ab6761610000517453462891ab7799f2934b568e" },
  { name: "Nadin Amizah", image: "https://i.scdn.co/image/ab67616100005174226dcfeea35e2dd268051744" },
  { name: "Hindia", image: "https://i.scdn.co/image/ab67616100005174b786cb6de7505caff17fe11f" },
  { name: "Raim Laode", image: "https://curupekspress.disway.id/upload/acef0f66ba46ce9d1cc1763fce945cc6.jpg" },
  { name: "Mahalini", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRcbqrCK_rcsiPcGy5-1MZ11Fih4ksYndQW4vXfEElkqQ&s=10" },
  { name: "Bernadya", image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSSUODj37EDD3ijIbgy57CFvX4d657c2qSv6ac9bshaxA&s=10" },
  { name: "Idgitaf", image: "https://i.scdn.co/image/ab67616100005174b394f3f8620f5f84a94599bc" },
  { name: "Pamungkas", image: "https://i1.sndcdn.com/artworks-000619270084-migegb-t500x500.jpg" },
];

const shuffleArray = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const PopularArtists = () => {
  const [shuffled] = useState(() => shuffleArray(artistsData));

  useEffect(() => {
    // Preload all artist images instantly on component mount
    preloadImages(artistsData.map(a => a.image));
  }, []);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
      {shuffled.map((artist) => (
        <div key={artist.name} className="flex-shrink-0 w-[calc(33.333%-11px)] text-center">
          <div className="w-full aspect-square rounded-full overflow-hidden border border-border shadow-lg">
            <img src={artist.image} alt={artist.name} className="w-full h-full object-cover" />
          </div>
          <p className="mt-2 text-[10px] font-medium text-foreground/80 truncate">{artist.name}</p>
        </div>
      ))}
    </div>
  );
};

export default PopularArtists;
