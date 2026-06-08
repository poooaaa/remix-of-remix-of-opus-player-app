import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Languages, Loader2, Check, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ArtistSong {
  title: string;
  artist: string;
  thumbnail: string;
  trackUrl: string;
}

interface AudioLike {
  currentTime: number;
}

interface LyricsSheetProps {
  lyrics: string | null;
  isVisible: boolean;
  onClose: () => void;
  trackTitle?: string;
  trackArtist?: string;
  audioRef?: React.RefObject<AudioLike | null>;
}

interface SyncLine {
  text: string;
  time?: number;
  isSpacer?: boolean;
}

const proxyFetch = async (url: string) => {
  const { data, error } = await supabase.functions.invoke("proxy", { body: { url } });
  if (error) throw new Error("Proxy request failed");
  return data;
};

const parseSyncedLyrics = (synced: string): SyncLine[] => {
  const rawLines = synced.split("\n");
  const parsed: SyncLine[] = [];

  for (const raw of rawLines) {
    const m = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (m) {
      const min = parseInt(m[1], 10);
      const sec = parseFloat(m[2]);
      const time = min * 60 + sec;
      const text = m[3].trim();

      if (text === "") {
        parsed.push({ text: "", isSpacer: true });
      } else {
        parsed.push({ text, time });
      }
    } else {
      const trimmed = raw.trim();
      if (trimmed === "") {
        parsed.push({ text: "", isSpacer: true });
      } else {
        parsed.push({ text: trimmed });
      }
    }
  }
  return parsed;
};

const parsePlainLyrics = (plain: string): SyncLine[] => {
  return plain.split("\n").map((line) => {
    const trimmed = line.trim();
    if (trimmed === "") {
      return { text: "", isSpacer: true };
    }
    return { text: trimmed };
  });
};

const LyricsSheet = ({ lyrics, isVisible, onClose, trackTitle, trackArtist, audioRef }: LyricsSheetProps) => {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  
  // Translation state
  const [translatedLyrics, setTranslatedLyrics] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslated, setShowTranslated] = useState(false);
  const [translateLabel, setTranslateLabel] = useState<null | "Id" | "En">(null);
  const [isSwitchingLabel, setIsSwitchingLabel] = useState(false);
  const [copied, setCopied] = useState(false);

  // Artist info state
  const [artistImage, setArtistImage] = useState<string | null>(null);
  const [artistName, setArtistName] = useState<string | null>(null);
  const [artistSongs, setArtistSongs] = useState<ArtistSong[]>([]);

  // LRCLIB direct states
  const [lrclibLyrics, setLrclibLyrics] = useState<string | null>(null);
  const [lrclibLines, setLrclibLines] = useState<SyncLine[] | null>(null);
  const [lrclibSyncActive, setLrclibSyncActive] = useState(false);
  const [isLoadingLrclib, setIsLoadingLrclib] = useState(false);
  const [currentLineIdx, setCurrentLineIdx] = useState(-1);

  const activeLineRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);

  // Reset all states and auto-load LRCLIB when track changes
  useEffect(() => {
    setTranslatedLyrics(null);
    setShowTranslated(false);
    setArtistImage(null);
    setArtistName(null);
    setArtistSongs([]);
    setLrclibLyrics(null);
    setLrclibLines(null);
    setLrclibSyncActive(false);
    setCurrentLineIdx(-1);
    setTranslateLabel(null);
    setIsSwitchingLabel(false);
    setCopied(false);

    if (!isVisible || !trackTitle) return;

    const loadLrclibLyrics = async () => {
      setIsLoadingLrclib(true);
      try {
        const res = await fetch(
          `https://lrclib.net/api/search?track_name=${encodeURIComponent(trackTitle)}&artist_name=${encodeURIComponent(trackArtist || "")}`
        );
        const data = await res.json();
        const hit = Array.isArray(data)
          ? data.find((d: any) => d?.syncedLyrics || d?.plainLyrics) || data[0]
          : null;

        if (hit) {
          if (hit.syncedLyrics) {
            const parsed = parseSyncedLyrics(hit.syncedLyrics);
            setLrclibLines(parsed);
            
            const plain = parsed.map((l) => l.text).join("\n");
            setLrclibLyrics(plain);
            
            // Keep sync deactivated by default until the user clicks the sync/podcast icon
            setLrclibSyncActive(false);
          } else if (hit.plainLyrics) {
            const parsed = parsePlainLyrics(hit.plainLyrics);
            setLrclibLines(parsed);
            setLrclibLyrics(hit.plainLyrics);
            setLrclibSyncActive(false);
          }
        }
      } catch (e) {
        console.error("LRCLIB fetch error:", e);
      } finally {
        setIsLoadingLrclib(false);
      }
    };

    loadLrclibLyrics();
  }, [isVisible, trackTitle, trackArtist]);

  // Fetch artist info when lyrics sheet opens
  useEffect(() => {
    if (!isVisible || !trackTitle) return;
    const fetchArtistInfo = async () => {
      try {
        const artist = trackArtist || "";
        const searchQ = artist || trackTitle;

        // Fetch artist photo from Deezer via proxy (avoids CORS)
        try {
          const deezerData = await proxyFetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(searchQ)}&limit=1`);
          const photo = deezerData?.data?.[0]?.picture_xl || deezerData?.data?.[0]?.picture_big || null;
          setArtistImage(photo);
          setArtistName(artist || trackTitle);
        } catch (e) {
          console.error("Deezer fetch error:", e);
        }

        // Fetch artist songs from iTunes
        try {
          const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchQ)}&entity=song&limit=10`);
          const itunesData = await itunesRes.json();
          if (itunesData?.results?.length > 0) {
            setArtistSongs(itunesData.results.map((t: any) => ({
              title: t.trackName,
              artist: t.artistName,
              thumbnail: t.artworkUrl100?.replace("100x100bb", "300x300bb") || "",
              trackUrl: t.trackViewUrl || "",
            })));
          }
        } catch (e) {
          console.error("iTunes fetch error:", e);
        }
      } catch (e) {
        console.error("Artist info error:", e);
      }
    };
    fetchArtistInfo();
  }, [isVisible, trackTitle, trackArtist]);

  const handleDragStart = useCallback((clientY: number) => {
    setIsDragging(true);
    startY.current = clientY;
    setDragY(0);
  }, []);

  const handleDragMove = useCallback((clientY: number) => {
    if (!isDragging) return;
    const diff = clientY - startY.current;
    setDragY(Math.max(0, diff));
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    if (dragY > 80) onClose();
    setDragY(0);
  }, [dragY, onClose]);

  const onTouchStart = (e: React.TouchEvent) => { e.stopPropagation(); handleDragStart(e.touches[0].clientY); };
  const onTouchMove = (e: React.TouchEvent) => { e.stopPropagation(); handleDragMove(e.touches[0].clientY); };
  const onTouchEnd = (e: React.TouchEvent) => { e.stopPropagation(); handleDragEnd(); };
  const onMouseDown = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); handleDragStart(e.clientY); };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => { e.preventDefault(); handleDragMove(e.clientY); };
    const onUp = (e: MouseEvent) => { e.preventDefault(); handleDragEnd(); };
    window.addEventListener("mousemove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [isDragging, handleDragMove, handleDragEnd]);

  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isVisible]);

  const detectLanguage = (text: string): "en" | "id" => {
    const idWords = ["dan", "yang", "di", "ini", "itu", "untuk", "dengan", "tidak", "aku", "kamu", "dari", "ada", "bisa", "akan", "sudah", "juga", "saya", "mereka", "pada", "apa"];
    const lower = text.toLowerCase();
    const words = lower.split(/\s+/);
    let idCount = 0;
    for (const w of words) {
      if (idWords.includes(w)) idCount++;
    }
    return idCount > words.length * 0.08 ? "en" : "id";
  };

  // Normalize string for comparison by removing casing, smart quotes, the specified punctuation, and spaces
  const normalizeLine = (str: string): string => {
    return str
      .toLowerCase()
      .replace(/[.,'"`?!_()[\]{}“”‘’~\\-]/g, "") // ignore dot, comma, quotes, brackets, hyphens
      .replace(/\s+/g, "") // remove all spacing for comparison robustness
      .trim();
  };

  // Determine line-by-line structure from Opus lyrics, and assign times from LRCLIB where lines match
  const finalLines = useMemo(() => {
    // If we don't have Opus lyrics, fallback to LRCLIB lines
    if (!lyrics) {
      return lrclibLines || [];
    }

    // 1. Parse Opus lyrics to plain lines preserving spacer lines
    const opusLines = parsePlainLyrics(lyrics);

    // 2. If we don't have synced lrclibLines with timestamps, just return the opusLines without timing
    if (!lrclibLines || lrclibLines.length === 0) {
      return opusLines;
    }

    // 3. Align opusLines with lrclibLines line-by-line using a chronological search pointer
    const alignedLines: SyncLine[] = [];
    let lrclibIdx = 0;

    for (let i = 0; i < opusLines.length; i++) {
      const oLine = opusLines[i];
      if (oLine.isSpacer || !oLine.text.trim()) {
        alignedLines.push({ ...oLine }); // Keep empty spacer line with no timestamp
        continue;
      }

      const oTextNorm = normalizeLine(oLine.text);
      let foundMatch = false;

      // Search forward in lrclibLines from current pointer for a matching non-empty line (up to 25 lines ahead)
      for (let j = lrclibIdx; j < Math.min(lrclibLines.length, lrclibIdx + 25); j++) {
        const lLine = lrclibLines[j];
        if (lLine.isSpacer || !lLine.text.trim()) continue;

        const lTextNorm = normalizeLine(lLine.text);
        if (lTextNorm === oTextNorm) {
          alignedLines.push({
            text: oLine.text,
            time: lLine.time, // Map LRCLIB timing to the Opus line
          });
          lrclibIdx = j + 1; // Advance searching pointer linearly
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        // No match found - keep Opus text, do not assign a timing
        // This will result in the active-highlighter pausing at the previous line
        alignedLines.push({
          text: oLine.text,
        });
      }
    }

    // Fallback: if alignment produced very few timings, use LRCLIB lines directly so sync still works
    const timedCount = alignedLines.filter((l) => l.time !== undefined).length;
    const lrclibTimedCount = lrclibLines.filter((l) => l.time !== undefined).length;
    if (lrclibTimedCount > 0 && timedCount < Math.min(3, lrclibTimedCount)) {
      return lrclibLines;
    }

    return alignedLines;
  }, [lyrics, lrclibLines]);

  const finalPlainLyrics = useMemo(() => {
    return lyrics || lrclibLyrics || "";
  }, [lyrics, lrclibLyrics]);

  const hasSyncTimings = useMemo(() => {
    return finalLines.some((l) => l.time !== undefined);
  }, [finalLines]);

  const handleTranslate = async () => {
    const textToTranslate = finalPlainLyrics;
    if (!textToTranslate) return;
    
    if (translatedLyrics) {
      setIsSwitchingLabel(true);
      setTimeout(() => {
        setShowTranslated((prev) => !prev);
        setTranslateLabel((prev) => (prev === "Id" ? "En" : "Id"));
        setIsSwitchingLabel(false);
      }, 1000);
      return;
    }

    setIsTranslating(true);
    try {
      const targetLang = detectLanguage(textToTranslate);
      const { data, error } = await supabase.functions.invoke("translate", {
        body: { text: textToTranslate, targetLang },
      });
      if (error) throw error;
      setTranslatedLyrics(data.translated);
      setShowTranslated(true);
      setTranslateLabel("Id");
    } catch (e) {
      console.error("Translation error:", e);
    } finally {
      setIsTranslating(false);
    }
  };

  const translatedLines = useMemo(
    () => (translatedLyrics ? translatedLyrics.split("\n") : []),
    [translatedLyrics]
  );

  const getLineDisplay = (idx: number, fallback: string) => {
    if (showTranslated && translatedLyrics) {
      const t = translatedLines[idx];
      if (t !== undefined && t.trim()) return t;
    }
    return fallback;
  };

  const handleCopy = async () => {
    const text = showTranslated && translatedLyrics ? translatedLyrics : (finalPlainLyrics || "");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
  };

  const handleSync = () => {
    if (!hasSyncTimings) return;
    setLrclibSyncActive((prev) => !prev);
  };

  // Poll audio currentTime while in sync mode — keep lyrics 0.5 seconds earlier as requested
  useEffect(() => {
    const isSyncActive = lrclibSyncActive && hasSyncTimings;
    if (!isSyncActive || !audioRef?.current) return;
    let raf = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        const t = audio.currentTime + 0.5; // Sync 0.5 seconds early as requested
        let idx = -1;
        for (let i = 0; i < finalLines.length; i++) {
          const line = finalLines[i];
          if (line.time !== undefined && line.time <= t) {
            idx = i;
          }
        }
        setCurrentLineIdx((prev) => (prev === idx ? prev : idx));
      }
      if (lrclibSyncActive) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lrclibSyncActive, hasSyncTimings, finalLines, audioRef]);

  // Auto-scroll active line into view
  useEffect(() => {
    if (lrclibSyncActive && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentLineIdx, lrclibSyncActive]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50" onTouchMove={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onClose(); }} />

      <div
        className="absolute left-0 right-0 bottom-0 pointer-events-auto"
        style={{
          height: "55vh",
          transform: `translateY(${isDragging ? dragY : 0}px)`,
          transition: isDragging ? "none" : "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div
          className="flex items-center justify-center pt-4 pb-3 cursor-grab active:cursor-grabbing rounded-t-2xl bg-muted border-t border-x border-border"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
        >
          <div className="w-20 h-1 rounded-full bg-muted-foreground/40" />
        </div>

        <div className="bg-muted h-full overflow-y-auto overscroll-contain border-x border-border px-6 pb-20">
          {finalPlainLyrics || finalLines.length > 0 ? (
            <>
              {lrclibSyncActive && hasSyncTimings ? (
                <div className="text-xs leading-relaxed text-muted-foreground pt-4">
                  {finalLines.map((line, idx) => {
                    if (line.isSpacer || !line.text.trim()) {
                      return (
                        <div key={idx} aria-hidden className="p-0 m-0">
                          <span className="invisible">&nbsp;</span>
                        </div>
                      );
                    }
                    const isActive = idx === currentLineIdx;
                    const display = getLineDisplay(idx, line.text);
                    return (
                      <div
                        key={idx}
                        ref={isActive ? activeLineRef : undefined}
                      >
                        {isActive ? (
                          <span className="bg-black/30 rounded-md px-2 -mx-2">{display}</span>
                        ) : (
                          display
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-line pt-4">
                  {showTranslated && translatedLyrics ? translatedLyrics : finalPlainLyrics}
                </p>
              )}

              {/* Artist image + songs */}
              {(artistImage || artistSongs.length > 0) && (
                <div className="flex gap-4 pt-5 items-start overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {artistImage && (
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="w-20 h-20 rounded-full overflow-hidden border border-border/30">
                        <img src={artistImage} alt="Artist" className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      </div>
                      {artistName && <p className="text-[10px] text-foreground/70 font-medium mt-2 text-center max-w-[80px] truncate">{artistName}</p>}
                    </div>
                  )}
                  {artistSongs.map((song, i) => (
                    <div key={i} className="flex flex-col items-center flex-shrink-0">
                      <div className="w-20 h-20 rounded-lg overflow-hidden bg-secondary">
                        <img src={song.thumbnail} alt={song.title} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
                      </div>
                      <p className="text-[10px] text-foreground/70 font-medium mt-2 text-center max-w-[80px] truncate">{song.title}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-8 mb-4 pt-4 border-t border-border/30 flex items-start justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground/60 font-medium">
                    Sumber lirik: LRCLIB
                  </p>
                  <p className="text-[9px] text-muted-foreground/30 mt-0.5">Lirik mungkin tidak 100% akurat</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center justify-center w-8 h-8 rounded-lg bg-foreground/5 backdrop-blur-md border border-foreground/10 text-muted-foreground opacity-60 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleSync}
                    disabled={isLoadingLrclib || !hasSyncTimings}
                    className="flex items-center justify-center w-8 h-8 rounded-lg bg-foreground/5 backdrop-blur-md border border-foreground/10 text-muted-foreground opacity-60 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  >
                    {isLoadingLrclib ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : lrclibSyncActive ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 16, lineHeight: 1 }}
                      >
                        podcasts
                      </span>
                    )}
                  </button>
                  <button
                    onClick={handleTranslate}
                    disabled={isTranslating || isSwitchingLabel}
                    className="flex items-center justify-center w-8 h-8 rounded-lg bg-foreground/5 backdrop-blur-md border border-foreground/10 text-muted-foreground opacity-60 transition-colors"
                  >
                    {isTranslating || isSwitchingLabel ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : translateLabel ? (
                      <span className="text-[11px] font-semibold leading-none">{translateLabel}</span>
                    ) : (
                      <Languages className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-center text-xs text-muted-foreground pt-10">
              Lirik tidak ditemukan
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LyricsSheet;
