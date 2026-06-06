import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Bookmark, ThumbsUp, ThumbsDown, Music, Loader2 } from "lucide-react";
const AI_LABS_ICON_URL = "https://i.pinimg.com/originals/e9/22/03/e9220344e070c715420e81baf4e81784.gif";

interface FloatingMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onSave: () => void;
  onLike: () => void;
  onDislike: () => void;
  onLyrics: () => void;
  onAILabs?: () => void;
  isSaved: boolean;
  isLiked: boolean;
  isDisliked: boolean;
  isLoadingLyrics?: boolean;
  isLoadingAILabs?: boolean;
  showAILabs?: boolean;
}

const ActionIcon = ({ Icon, active }: { Icon: typeof Bookmark; active: boolean }) => (
  <Icon
    size={16}
    fill={active ? "currentColor" : "none"}
    strokeWidth={2}
  />
);

const MenuItem = ({ icon, label, onClick, disabled, bigIcon }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; bigIcon?: boolean }) => (
  <button
    className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] font-medium text-foreground opacity-80 disabled:opacity-50"
    onClick={onClick}
    disabled={disabled}
    style={{ WebkitTapHighlightColor: "transparent" }}
  >
    <span className="w-4 h-4 flex items-center justify-center shrink-0 relative">
      {bigIcon ? (
        <span className="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10">{icon}</span>
      ) : icon}
    </span>
    {label}
  </button>
);

const FloatingMenu = ({ position, onClose, onSave, onLike, onDislike, onLyrics, onAILabs, isSaved, isLiked, isDisliked, isLoadingLyrics, isLoadingAILabs, showAILabs }: FloatingMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const isBusy = isLoadingLyrics || isLoadingAILabs;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        if (!isBusy) onClose();
      }
    };
    const handleScroll = () => { if (!isBusy) onClose(); };
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClick);
      window.addEventListener("scroll", handleScroll, true);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose, isBusy]);

  const adjustedX = Math.min(Math.max(8, position.x - 80), window.innerWidth - 176);
  const adjustedY = Math.min(Math.max(8, position.y - 10), window.innerHeight - 300);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 bg-background/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl py-2 min-w-[160px] animate-scale-in origin-top-left"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <MenuItem
        icon={<ActionIcon Icon={Bookmark} active={isSaved} />}
        label={isSaved ? "Tersimpan" : "Simpan"}
        onClick={onSave}
        disabled={isBusy}
      />
      <MenuItem
        icon={<ActionIcon Icon={ThumbsUp} active={isLiked} />}
        label={isLiked ? "Liked" : "Like"}
        onClick={onLike}
        disabled={isBusy}
      />
      <MenuItem
        icon={<ActionIcon Icon={ThumbsDown} active={isDisliked} />}
        label={isDisliked ? "Disliked" : "Dislike"}
        onClick={onDislike}
        disabled={isBusy}
      />
      {showAILabs && onAILabs && (
        <>
          <div className="my-1 mx-3 border-t border-border" />
          <MenuItem
            icon={isLoadingAILabs
              ? <Loader2 size={16} className="animate-spin text-foreground" />
              : <img src={AI_LABS_ICON_URL} alt="AI" className="w-full h-full rounded-full object-cover" />
            }
            label={isLoadingAILabs ? "Memuat AI..." : "Labs AI"}
            onClick={onAILabs}
            disabled={isBusy}
            bigIcon={!isLoadingAILabs}
          />
        </>
      )}
      <div className="my-1 mx-3 border-t border-border" />
      <MenuItem
        icon={isLoadingLyrics ? <Loader2 size={16} className="animate-spin text-foreground" /> : <Music size={16} />}
        label={isLoadingLyrics ? "Memuat lirik..." : "Lyrics"}
        onClick={onLyrics}
        disabled={isBusy}
      />
    </div>,
    document.body
  );
};

export default FloatingMenu;
