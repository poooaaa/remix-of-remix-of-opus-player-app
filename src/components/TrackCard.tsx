import { useRef, useCallback } from "react";
import { MoreVertical } from "lucide-react";
import SpinnerLogo from "@/components/SpinnerLogo";
const appleMusicIcon = "https://raw.githubusercontent.com/uploader762/dat1/main/uploads/4db0fb-1775055603762.jpg";
const spotifyIcon = "https://raw.githubusercontent.com/uploader762/dat1/main/uploads/0ba187-1775055546315.jpg";

export interface Track {
  title: string;
  thumbnail: string;
  duration: string;
  duration_ms: number;
  track_url: string;
  artist?: string;
  source: "spotify" | "applemusic";
}

interface TrackCardProps {
  track: Track;
  isPlaying: boolean;
  isLoading: boolean;
  remainingTime: string | null;
  onPlay: () => void;
  onLongPress: (position: { x: number; y: number }) => void;
}

const parseDurationToMs = (duration: string): number => {
  const parts = duration.split(":");
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    if (!isNaN(minutes) && !isNaN(seconds)) {
      return (minutes * 60 + seconds) * 1000;
    }
  }
  return 0;
};

const formatTime = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}.${seconds < 10 ? "0" : ""}${seconds}`;
};

export { parseDurationToMs, formatTime };

const TrackCard = ({ track, isPlaying, isLoading, remainingTime, onPlay, onLongPress }: TrackCardProps) => {
  const durationMs = track.duration_ms > 0 ? track.duration_ms : parseDurationToMs(track.duration);
  const displayTime = remainingTime ?? (durationMs > 0 ? formatTime(durationMs) : "--:--");
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const pointerPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
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

  const handleMenuClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onLongPress({ x: rect.left, y: rect.bottom + 4 });
  }, [onLongPress]);

  return (
    <div className="flex flex-col animate-fade-in-up transition-transform duration-200 active:scale-[0.98]">
      <div
        className="relative w-full aspect-square overflow-hidden bg-secondary rounded-[4px] shadow-2xl cursor-pointer select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: "auto" }}
      >
        <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover pointer-events-none" />

        {/* Duration Box */}
        <div className="absolute top-0 right-0 mt-2 mr-2 bg-background/90 backdrop-blur-md border border-border px-2 py-1 rounded-lg z-10">
          <span className="text-[9px] text-foreground leading-none block">
            {displayTime}
          </span>
        </div>

        {/* Visualizer */}
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[2px]">
            <div className="flex gap-1 items-end h-6">
              <div className="w-1 animate-bounce-bar-1" style={{ backgroundColor: "#52B788" }} />
              <div className="w-1 animate-bounce-bar-2" style={{ backgroundColor: "#52B788" }} />
              <div className="w-1 animate-bounce-bar-3" style={{ backgroundColor: "#52B788" }} />
            </div>
          </div>
        )}

        {/* Loading overlay (center of image, only while track is loading) */}
        {isLoading && !isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[2px]">
            <SpinnerLogo size={36} />
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] font-semibold truncate w-full tracking-tight text-foreground/90">
        {track.title}
      </p>

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={onPlay}
          className={`px-3 py-1.5 border rounded-2xl text-[9px] font-bold uppercase tracking-widest outline-none ${
            isPlaying || isLoading
              ? "border-transparent"
              : "border-border text-foreground bg-transparent"
          }`}
          style={isPlaying || isLoading ? { borderColor: "#52B788", color: "#52B788", backgroundColor: "rgba(82, 183, 136, 0.1)" } : undefined}
        >
          {isLoading ? "LOADING..." : isPlaying ? "PLAYING..." : "play music"}
        </button>

        <div className="flex-shrink-0">
          <img
            src={track.source === "applemusic" ? appleMusicIcon : spotifyIcon}
            alt={track.source === "applemusic" ? "Apple Music" : "Spotify"}
            className="h-6 object-contain"
          />
        </div>

        <button
          onClick={handleMenuClick}
          className="flex-shrink-0 p-1 -mr-1"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <MoreVertical size={16} className="text-foreground/80" />
        </button>
      </div>
    </div>
  );
};

export default TrackCard;
