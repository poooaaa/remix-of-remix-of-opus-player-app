import { useRef, useCallback } from "react";
import { MoreVertical, Loader2 } from "lucide-react";

import { type Track, parseDurationToMs } from "@/components/TrackCard";


interface TrackRowCardProps {
  track: Track;
  isPlaying: boolean;
  isLoading: boolean;
  onPlay: () => void;
  onLongPress: (position: { x: number; y: number }) => void;
}

const TrackRowCard = ({ track, isPlaying, isLoading, onPlay, onLongPress }: TrackRowCardProps) => {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const pointerPos = useRef({ x: 0, y: 0 });
  const menuClicked = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    menuClicked.current = false;
    pointerPos.current = { x: e.clientX, y: e.clientY };
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress(pointerPos.current);
    }, 500);
  }, [onLongPress]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!longPressTimer.current) return;
    const dx = e.clientX - pointerPos.current.x;
    const dy = e.clientY - pointerPos.current.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    clearTimer();
    // Only play if not from long press and not from menu button
    if (!didLongPress.current && !menuClicked.current) {
      onPlay();
    }
  }, [onPlay, clearTimer]);

  const handleMenuClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    menuClicked.current = true;
    didLongPress.current = true;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onLongPress({ x: rect.left, y: rect.bottom + 4 });
  }, [onLongPress]);

  // Extract display title (remove "Artist - " prefix if present)
  const displayTitle = track.title.includes(" - ")
    ? track.title.split(" - ").slice(1).join(" - ")
    : track.title;

  const artistName = track.artist || "Unknown";

  return (
    <div
      className="flex items-center gap-3 py-2 cursor-pointer select-none active:scale-[0.99] transition-transform duration-150"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={clearTimer}
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitTapHighlightColor: "transparent", touchAction: "pan-y" }}
    >
      {/* Thumbnail */}
      <div className="relative flex-shrink-0 w-12 h-12 rounded-[4px] overflow-hidden bg-secondary">
        <img
          src={track.thumbnail}
          alt={displayTitle}
          className="w-full h-full object-cover pointer-events-none"
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isPlaying && (
            <div className="flex gap-[2px] items-end h-[13px] flex-shrink-0">
              <div className="w-[2.5px] animate-bounce-bar-1" style={{ backgroundColor: "#52B788" }} />
              <div className="w-[2.5px] animate-bounce-bar-2" style={{ backgroundColor: "#52B788" }} />
              <div className="w-[2.5px] animate-bounce-bar-3" style={{ backgroundColor: "#52B788" }} />
            </div>
          )}
          <p className="text-[13px] font-semibold text-foreground/90 truncate">{displayTitle}</p>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {track.source === "spotify" && (
            <span className="text-[11px] flex-shrink-0 opacity-60">🅴</span>
          )}
          <p className="text-[11px] text-muted-foreground truncate">Lagu - {artistName}</p>
        </div>
      </div>

      {/* 3-dot menu - fully isolated from row events */}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          menuClicked.current = true;
          didLongPress.current = true;
          clearTimer();
        }}
        onPointerUp={(e) => { e.stopPropagation(); }}
        onPointerMove={(e) => { e.stopPropagation(); }}
        className="flex-shrink-0"
      >
        <button
          onClick={handleMenuClick}
          className="p-2"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" style={{ color: "#52B788" }} />
          ) : (
            <MoreVertical size={16} className="text-foreground/60" />
          )}
        </button>
      </div>
    </div>
  );
};

export default TrackRowCard;
