import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { loadYouTubeAPI } from "@/lib/youtubeApi";

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  channel: string;
  url: string;
}

export interface YTVideoHandle {
  play: () => void;
  pause: () => void;
  unload: () => void;
}

interface Props {
  video: YouTubeVideo;
  isActive: boolean;
  onSelect: () => void;
  onEnded?: () => void;
}

const formatYTDuration = (dur: string): string => {
  if (!dur) return "--:--";
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) {
    return `${parts[0]}:${String(parts[1]).padStart(2, "0")}:${String(parts[2]).padStart(2, "0")}`;
  }
  if (parts.length === 2) {
    return `${parts[0]}.${String(parts[1]).padStart(2, "0")}`;
  }
  return dur;
};

const YouTubeCard = forwardRef<YTVideoHandle, Props>(({ video, isActive, onSelect, onEnded }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    loadYouTubeAPI().then(() => {
      if (cancelled || !containerRef.current) return;
      const inner = document.createElement("div");
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(inner);
      playerRef.current = new window.YT.Player(inner, {
        videoId: video.id,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
        },
        events: {
          onStateChange: (e: any) => {
            if (window.YT && e.data === window.YT.PlayerState.ENDED) {
              onEndedRef.current?.();
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy?.(); } catch {}
      playerRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [isActive, video.id]);

  useImperativeHandle(ref, () => ({
    play: () => { try { playerRef.current?.playVideo?.(); } catch {} },
    pause: () => { try { playerRef.current?.pauseVideo?.(); } catch {} },
    unload: () => {
      try { playerRef.current?.stopVideo?.(); } catch {}
      try { playerRef.current?.destroy?.(); } catch {}
      playerRef.current = null;
    },
  }), []);

  const displayTitle = (() => {
    const channel = (video.channel || "").trim().toLowerCase();
    const title = (video.title || "").trim();
    if (channel && title.toLowerCase().startsWith(channel)) return title;
    return channel ? `${video.channel} - ${title}` : title;
  })();

  return (
    <div className="w-full animate-fade-in-up">
      <div
        className={`relative w-full aspect-video overflow-hidden bg-secondary select-none transition-all duration-300 ${isActive ? "rounded-3xl" : "rounded-lg cursor-pointer"}`}
        onClick={isActive ? undefined : onSelect}
      >
        {isActive ? (
          <>
            <div ref={containerRef} className="absolute inset-0 w-full h-full" />
            {/* Overlay blocks all pointer events on the iframe */}
            <div
              className="absolute inset-0 z-10"
              style={{ background: "transparent" }}
              onClick={(e) => e.stopPropagation()}
            />
          </>
        ) : (
          <>
            <img
              src={video.thumbnail}
              alt={video.title}
              className="w-full h-full object-cover pointer-events-none"
              loading="lazy"
            />
            <div className="absolute bottom-0 right-0 mb-2 mr-2 bg-background/90 backdrop-blur-md border border-border px-2 py-1 rounded-lg z-10">
              <span className="text-[9px] text-foreground leading-none block">
                {formatYTDuration(video.duration)}
              </span>
            </div>
          </>
        )}
      </div>

      <p className="mt-2 text-[13.65px] font-semibold tracking-tight text-foreground/90 line-clamp-2">
        {displayTitle}
      </p>
    </div>
  );
});

YouTubeCard.displayName = "YouTubeCard";
export default YouTubeCard;