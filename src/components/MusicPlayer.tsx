import { Play, Pause, X, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { type Track } from "@/components/TrackCard";

interface MusicPlayerProps {
  track: Track;
  isPlaying: boolean;
  isLoading?: boolean;
  onTogglePlay: () => void;
  onClose: () => void;
}

const MusicPlayer = ({ track, isPlaying, isLoading, onTogglePlay, onClose }: MusicPlayerProps) => {
  const displayTitle = track.title.includes(" - ")
    ? track.title.split(" - ").slice(1).join(" - ")
    : track.title;
  const artistName = track.artist || "Unknown";

  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const dismissedRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    startXRef.current = e.clientX;
    setDragging(true);
    dismissedRef.current = false;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startXRef.current === null) return;
    setDragX(e.clientX - startXRef.current);
  };
  const onPointerUp = () => {
    const threshold = 120;
    if (Math.abs(dragX) > threshold && !dismissedRef.current) {
      dismissedRef.current = true;
      onClose();
    }
    setDragging(false);
    setDragX(0);
    startXRef.current = null;
  };

  const opacity = Math.max(0.3, 1 - Math.abs(dragX) / 250);

  return (
    <div
      className="fixed left-1/2 z-40 w-[calc(100%-16px)] max-w-[440px]"
      style={{
        bottom: "max(8px, env(safe-area-inset-bottom))",
        transform: `translateX(calc(-50% + ${dragX}px))`,
        transition: dragging ? "none" : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s",
        opacity,
        touchAction: "pan-y",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="flex items-center gap-3 bg-card/95 backdrop-blur-xl border border-border rounded-2xl p-2 pr-2 shadow-2xl">
        <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-secondary">
          <img
            src={track.thumbnail}
            alt={displayTitle}
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isPlaying && (
              <div className="flex gap-[2px] items-end h-[13px] flex-shrink-0">
                <div className="w-[2.5px] animate-bounce-bar-1" style={{ backgroundColor: "#52B788" }} />
                <div className="w-[2.5px] animate-bounce-bar-2" style={{ backgroundColor: "#52B788" }} />
                <div className="w-[2.5px] animate-bounce-bar-3" style={{ backgroundColor: "#52B788" }} />
              </div>
            )}
            <p className="text-[13px] font-semibold text-foreground/95 truncate">{displayTitle}</p>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{artistName}</p>
        </div>
        <div className="flex items-center gap-0 flex-shrink-0">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); if (!isLoading) onTogglePlay(); }}
            className="w-9 h-9 flex items-center justify-center rounded-full"
            aria-label={isPlaying ? "Pause" : "Play"}
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {isLoading ? (
              <Loader2 size={20} className="text-foreground animate-spin" strokeWidth={2.5} />
            ) : isPlaying ? (
              <Pause size={20} className="text-foreground" style={{ fill: "currentColor", strokeWidth: 0 }} />
            ) : (
              <Play size={20} className="text-foreground" style={{ fill: "currentColor", strokeWidth: 0 }} />
            )}
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="w-8 h-8 flex items-center justify-center rounded-full"
            aria-label="Close player"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MusicPlayer;
