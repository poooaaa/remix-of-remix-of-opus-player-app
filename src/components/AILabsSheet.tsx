import { useState, useRef, useCallback, useEffect } from "react";
import { Languages, Loader2, Settings, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import SpinnerLogo from "@/components/SpinnerLogo";

interface ArtistSong {
  title: string;
  artist: string;
  thumbnail: string;
  trackUrl: string;
}

interface AILabsSheetProps {
  isVisible: boolean;
  onClose: () => void;
  summary: string | null;
  artistImage: string | null;
  artistName: string | null;
  artistSongs: ArtistSong[];
  isLoading: boolean;
}

const AILabsSheet = ({ isVisible, onClose, summary, artistImage, artistName, artistSongs, isLoading }: AILabsSheetProps) => {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [translatedSummary, setTranslatedSummary] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslated, setShowTranslated] = useState(false);
  const [translateLabel, setTranslateLabel] = useState<null | "Id" | "En">(null);
  const [isSwitchingLabel, setIsSwitchingLabel] = useState(false);
  const [summarizedText, setSummarizedText] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showSummarized, setShowSummarized] = useState(false);
  const [copied, setCopied] = useState(false);
  const startY = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTranslatedSummary(null);
    setShowTranslated(false);
    setSummarizedText(null);
    setShowSummarized(false);
    setTranslateLabel(null);
    setIsSwitchingLabel(false);
  }, [summary]);

  useEffect(() => {
    setCopied(false);
  }, [summary]);

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
    const idWords = ["dan", "yang", "di", "ini", "itu", "untuk", "dengan", "tidak", "aku", "kamu", "dari", "ada", "bisa", "akan", "sudah", "juga", "saya", "mereka", "pada", "apa", "lagu", "oleh", "tentang"];
    const lower = text.toLowerCase();
    const words = lower.split(/\s+/);
    let idCount = 0;
    for (const w of words) {
      if (idWords.includes(w)) idCount++;
    }
    return idCount > words.length * 0.08 ? "id" : "en";
  };

  // Get the currently displayed text
  const getDisplayedText = (): string => {
    if (showSummarized && summarizedText) return summarizedText;
    if (showTranslated && translatedSummary) return translatedSummary;
    return summary || "";
  };

  const handleTranslate = async () => {
    if (!summary) return;
    if (translatedSummary) {
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
      const currentText = getDisplayedText();
      const lang = detectLanguage(currentText);
      const targetLang = lang === "id" ? "en" : "id";
      const { data, error } = await supabase.functions.invoke("translate", {
        body: { text: currentText, targetLang },
      });
      if (error) throw error;
      setTranslatedSummary(data.translated);
      setShowTranslated(true);
      setTranslateLabel("Id");
    } catch (e) {
      console.error("Translation error:", e);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSummarize = async () => {
    if (!summary) return;
    if (showSummarized && summarizedText) {
      setShowSummarized(false);
      return;
    }
    if (summarizedText) {
      setShowSummarized(true);
      return;
    }

    setIsSummarizing(true);
    try {
      const currentText = getDisplayedText();
      const lang = detectLanguage(currentText);
      const { data, error } = await supabase.functions.invoke("summarize", {
        body: { text: currentText, lang },
      });
      if (error) throw error;
      setSummarizedText(data.summary);
      setShowSummarized(true);
      // Reset translation since text changed
      setTranslatedSummary(null);
      setShowTranslated(false);
    } catch (e) {
      console.error("Summarize error:", e);
    } finally {
      setIsSummarizing(false);
    }
  };

  const displayText = (): string => {
    if (showSummarized && summarizedText) {
      if (showTranslated && translatedSummary) return translatedSummary;
      return summarizedText;
    }
    if (showTranslated && translatedSummary) return translatedSummary;
    return summary || "";
  };

  const handleCopy = async () => {
    const text = displayText();
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50" onTouchMove={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onClose(); }} />

      <div
        className="absolute left-0 right-0 bottom-0 pointer-events-auto"
        style={{
          height: "65vh",
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

        <div ref={scrollRef} className="bg-muted h-full overflow-y-auto overscroll-contain border-x border-border px-6 pb-20">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center pt-16 gap-3">
              <SpinnerLogo size={44} />
              <p className="text-[11px] text-muted-foreground">Memuat AI...</p>
            </div>
          ) : (
            <>
              {summary && (
                <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-line pt-5">
                  {displayText()}
                </p>
              )}

              {(artistImage || artistSongs.length > 0) && (
                <div className="flex gap-4 pt-5 items-start overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {artistImage && (
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="w-20 h-20 rounded-full overflow-hidden border border-border/30">
                        <img
                          src={artistImage}
                          alt="Artist"
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                      {artistName && (
                        <p className="text-[10px] text-foreground/70 font-medium mt-2 text-center max-w-[80px] truncate">{artistName}</p>
                      )}
                    </div>
                  )}

                  {artistSongs.length > 0 && artistSongs.map((song, i) => (
                    <div key={i} className="flex flex-col items-center flex-shrink-0">
                      <div className="w-20 h-20 rounded-lg overflow-hidden bg-secondary">
                        <img
                          src={song.thumbnail}
                          alt={song.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
                        />
                      </div>
                      <p className="text-[10px] text-foreground/70 font-medium mt-2 text-center max-w-[80px] truncate">{song.title}</p>
                    </div>
                  ))}
                </div>
              )}

              {!summary && !artistImage && (
                <p className="text-center text-xs text-muted-foreground pt-10">Data tidak tersedia</p>
              )}

              <div className="mt-8 mb-4 pt-4 border-t border-border/30 flex items-start justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground/60 font-medium">Powered by Labs AI</p>
                  <p className="text-[9px] text-muted-foreground/40 mt-1">Informasi mungkin tidak 100% akurat</p>
                </div>
                {summary && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-foreground/5 backdrop-blur-md border border-foreground/10 text-muted-foreground/60 transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={handleTranslate}
                      disabled={isTranslating || isSwitchingLabel}
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-foreground/5 backdrop-blur-md border border-foreground/10 text-muted-foreground/60 transition-colors"
                    >
                      {isTranslating || isSwitchingLabel ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : translateLabel ? (
                        <span className="text-[11px] font-semibold leading-none">{translateLabel}</span>
                      ) : (
                        <Languages className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={handleSummarize}
                      disabled={isSummarizing}
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-foreground/5 backdrop-blur-md border border-foreground/10 text-muted-foreground/60 transition-colors"
                    >
                      <Settings className={`w-3.5 h-3.5 ${isSummarizing ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AILabsSheet;
