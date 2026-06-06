import { useEffect, useState, useRef } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import SpinnerLogo from "@/components/SpinnerLogo";

interface Suggestion {
  label: string;
  query: string;
  thumbnail?: string;
  type: "song" | "artist";
}

interface SearchSuggestionsProps {
  query: string;
  visible: boolean;
  onPick: (q: string) => void;
}

const proxyFetch = async (url: string) => {
  const { data, error } = await supabase.functions.invoke("proxy", { body: { url } });
  if (error) throw new Error("Proxy request failed");
  return data;
};

const SearchSuggestions = ({ query, visible, onPick }: SearchSuggestionsProps) => {
  const [items, setItems] = useState<Suggestion[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!visible || q.length < 2) {
      setItems([]);
      return;
    }

    const t = setTimeout(async () => {
      try {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song,musicArtist&limit=8`,
          { signal: ctrl.signal }
        );
        const data = await res.json();
        const results = data?.results || [];

        const artists: Suggestion[] = [];
        const songs: Suggestion[] = [];
        const seen = new Set<string>();

        for (const r of results) {
          if (r.wrapperType === "artist" && r.artistName) {
            const key = `artist::${r.artistName.toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            artists.push({ label: r.artistName, query: r.artistName, type: "artist" });
          } else if ((r.kind === "song" || r.wrapperType === "track") && r.trackName) {
            const key = `song::${(r.trackName + r.artistName).toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            songs.push({
              label: `${r.trackName} — ${r.artistName}`,
              query: `${r.trackName} ${r.artistName}`,
              thumbnail: r.artworkUrl100 || r.artworkUrl60,
              type: "song",
            });
          }
        }

        // Ensure at least 1 artist by deriving from a song's artistName
        if (artists.length === 0 && songs.length > 0) {
          for (const r of results) {
            if ((r.kind === "song" || r.wrapperType === "track") && r.artistName) {
              const key = `artist::${r.artistName.toLowerCase()}`;
              if (seen.has(key)) continue;
              seen.add(key);
              artists.push({ label: r.artistName, query: r.artistName, type: "artist" });
              break;
            }
          }
        }

        // Determine if user typed an EXACT artist name (full, no typo)
        const qLower = q.toLowerCase().trim();
        const exactArtist = artists.find((a) => a.label.toLowerCase() === qLower);

        // Build interleaved list:
        // - Top slot: a song (unless user typed an exact artist name → that artist goes first)
        // - No more than 2 consecutive artists
        // - Random gap (>=2 songs) between artist groups when possible
        const list: Suggestion[] = [];
        const songQueue = [...songs];
        const artistQueue = artists.filter((a) => !exactArtist || a.label !== exactArtist.label);

        if (exactArtist) {
          list.push(exactArtist);
        }

        // Always put at least one song before any (non-exact) artist appears
        if (songQueue.length > 0) list.push(songQueue.shift()!);

        let consecutiveArtists = list.length > 0 && list[list.length - 1].type === "artist" ? 1 : 0;
        let songsSinceArtist = list[list.length - 1]?.type === "song" ? 1 : 0;
        // Random required gap of songs between artist groups (2 or more)
        const randGap = () => 2 + Math.floor(Math.random() * 2); // 2 or 3
        let nextArtistAfter = randGap();

        while (songQueue.length > 0 || artistQueue.length > 0) {
          const canPlaceArtist =
            artistQueue.length > 0 &&
            consecutiveArtists < 2 &&
            (consecutiveArtists > 0 || songsSinceArtist >= nextArtistAfter || songQueue.length === 0);

          if (canPlaceArtist) {
            list.push(artistQueue.shift()!);
            consecutiveArtists += 1;
            songsSinceArtist = 0;
            if (consecutiveArtists >= 2) {
              nextArtistAfter = randGap();
            }
          } else if (songQueue.length > 0) {
            list.push(songQueue.shift()!);
            if (consecutiveArtists > 0) consecutiveArtists = 0;
            songsSinceArtist += 1;
          } else {
            break;
          }
        }

        setItems(list);

        // Fetch real artist photos from Deezer (same system as LyricsSheet/AILabsSheet)
        const pendingArtists = list.filter((it) => it.type === "artist");
        if (pendingArtists.length > 0) {
          await Promise.all(
            pendingArtists.map(async (item) => {
              try {
                const deezerData = await proxyFetch(
                  `https://api.deezer.com/search/artist?q=${encodeURIComponent(item.query)}&limit=1`
                );
                const photo =
                  deezerData?.data?.[0]?.picture_big ||
                  deezerData?.data?.[0]?.picture_medium ||
                  deezerData?.data?.[0]?.picture ||
                  null;
                if (photo) item.thumbnail = photo;
              } catch {}
            })
          );
          if (!ctrl.signal.aborted) setItems([...list]);
        }
      } catch {}
    }, 180);

    return () => clearTimeout(t);
  }, [query, visible]);

  if (!visible || items.length === 0) return null;

  return (
    <div className="absolute top-full left-0 right-[-60px] mt-2 bg-popover border border-border rounded-2xl overflow-hidden shadow-2xl z-30 max-h-[80vh] overflow-y-auto">
      {items.map((it, i) => {
        const isArtist = it.type === "artist";
        const shapeClass = isArtist ? "rounded-full" : "rounded-sm";
        return (
          <button
            key={i}
            onMouseDown={(e) => { e.preventDefault(); onPick(it.query); }}
            className="w-full flex items-center gap-3 px-3 py-3 text-left"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {it.thumbnail ? (
              <img
                src={it.thumbnail}
                alt=""
                className={`w-[37px] h-[37px] ${shapeClass} object-cover flex-shrink-0 pointer-events-none ${isArtist ? "border border-border/30" : ""}`}
                draggable={false}
              />
            ) : (
              <div className={`w-[37px] h-[37px] ${shapeClass} bg-secondary flex items-center justify-center flex-shrink-0 ${isArtist ? "border border-border/30" : ""}`}>
                {isArtist ? (
                  <SpinnerLogo size={22} />
                ) : (
                  <Search className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-foreground/95 truncate">{it.label}</p>
              <p className="text-[10px] text-muted-foreground">{isArtist ? "Artis" : "Lagu"}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default SearchSuggestions;
