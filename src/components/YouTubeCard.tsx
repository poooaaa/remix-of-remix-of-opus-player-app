import { useState, useRef, useCallback, useEffect } from "react";
import SpinnerLogo from "@/components/SpinnerLogo";

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  channel: string;
  url: string;
}

interface YouTubeCardProps {
  video: YouTubeVideo;
  onPlayStart?: () => void;
  stopSignal?: number;
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

import { supabase } from "@/integrations/supabase/client";

const YouTubeCard = ({ video, onPlayStart, stopSignal }: YouTubeCardProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const onPlayStartRef = useRef(onPlayStart);
  onPlayStartRef.current = onPlayStart;

  useEffect(() => {
    if (stopSignal === undefined) return;
    setIsPlaying(false);
    setIsLoading(false);
    setVideoUrl(null);
  }, [stopSignal]);

  const handleClick = useCallback(async () => {
    if (isPlaying || isLoading) return;
    // Hard limit: skip videos longer than 10 minutes — don't even hit resolve endpoint.
    const parts = (video.duration || "").split(":").map(Number);
    let secs = 0;
    if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
    if (secs > 600) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-video", {
        body: { url: video.url },
      });
      if (error) throw error;
      const url = (data as any)?.previewUrl;
      if (!url) throw new Error("No preview URL");
      setVideoUrl(url);
      onPlayStartRef.current?.();
      setIsPlaying(true);
    } catch (e) {
      console.error("resolve-video error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [isPlaying, isLoading, video.url, video.duration]);

  return (
    <div className="w-full animate-fade-in-up">
      <div
        className={`relative w-full aspect-video overflow-hidden bg-secondary cursor-pointer select-none transition-all duration-300 ${isPlaying ? "rounded-3xl" : "rounded-lg"}`}
        onClick={handleClick}
      >
        {isPlaying && videoUrl ? (
          <video
            src={videoUrl}
            className="w-full h-full block bg-black"
            controls
            autoPlay
            playsInline
            controlsList="nodownload"
          />
        ) : (
          <>
            <img
              src={video.thumbnail}
              alt={video.title}
              className="w-full h-full object-cover pointer-events-none"
              loading="lazy"
            />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[2px]">
                <SpinnerLogo size={36} />
              </div>
            )}
            <div className="absolute bottom-0 right-0 mb-2 mr-2 bg-background/90 backdrop-blur-md border border-border px-2 py-1 rounded-lg z-10">
              <span className="text-[9px] text-foreground leading-none block">
                {formatYTDuration(video.duration)}
              </span>
            </div>
          </>
        )}
      </div>

      <p className="mt-2 text-[13.65px] font-semibold tracking-tight text-foreground/90 line-clamp-2">
        {(() => {
          const channel = (video.channel || "").trim().toLowerCase();
          const title = (video.title || "").trim();
          const titleLower = title.toLowerCase();
          if (channel && titleLower.startsWith(channel)) {
            return title;
          }
          return channel ? `${video.channel} - ${title}` : title;
        })()}
      </p>
    </div>
  );
};

export default YouTubeCard;
