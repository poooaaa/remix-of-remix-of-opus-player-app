export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  channel: string;
  url: string;
}

interface Props {
  video: YouTubeVideo;
  onSelect?: () => void;
}

const formatYTDuration = (dur: string | number): string => {
  if (!dur) return "--:--";
  if (typeof dur === "number") {
    const minutes = Math.floor(dur / 60);
    const seconds = Math.floor(dur % 60);
    return `${minutes}.${String(seconds).padStart(2, "0")}`;
  }
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) {
    return `${parts[0]}:${String(parts[1]).padStart(2, "0")}:${String(parts[2]).padStart(2, "0")}`;
  }
  if (parts.length === 2) {
    return `${parts[0]}.${String(parts[1]).padStart(2, "0")}`;
  }
  return dur;
};

const YouTubeCard = ({ video, onSelect }: Props) => {
  const youtubeUrl = video.url || (video.id ? `https://www.youtube.com/watch?v=${video.id}` : "");

  return (
    <div className="w-full animate-fade-in-up">
      <a
        href={youtubeUrl || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block w-full aspect-video overflow-hidden bg-secondary select-none rounded-lg cursor-pointer"
        aria-label={`Buka ${video.title} di YouTube`}
        onClick={(event) => {
          if (!youtubeUrl) {
            event.preventDefault();
            return;
          }
          onSelect?.();
        }}
      >
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
      </a>

      <p className="mt-2 text-[13.65px] font-semibold text-foreground/90 line-clamp-2">
        {video.title}
      </p>
      {video.channel && (
        <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
          {video.channel}
        </p>
      )}
    </div>
  );
};

export default YouTubeCard;