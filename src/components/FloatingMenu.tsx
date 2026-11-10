import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Bookmark, Music, Loader2 } from "lucide-react";
import opusFableIcon from "@/assets/opus-fable-icon.png.asset.json";

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

const MaterialIcon = ({ name, active }: { name: string; active: boolean }) => (
  <span
    className="material-symbols-outlined inline-flex h-[18px] w-[18px] shrink-0 transform-none items-center justify-center text-[17px] leading-none select-none"
    style={{ fontVariationSettings: `'FILL' ${active ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24` }}
  >
    {name}
  </span>
);

const MenuItem = ({ icon, label, onClick, disabled, bigIcon }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; bigIcon?: boolean }) => (
  <button
    className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] font-medium text-foreground opacity-80 disabled:opacity-50 transform-none transition-none active:scale-100"
    onClick={onClick}
    disabled={disabled}
    style={{ WebkitTapHighlightColor: "transparent" }}
  >
    <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
      {bigIcon ? (
        <span className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2">{icon}</span>
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
      className="fixed z-50 bg-background/95 backdrop-blur-xl border border-border rounded-lg shadow-2xl py-2 min-w-[160px] animate-scale-in origin-top-left"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <MenuItem
        icon={<Bookmark size={17} fill={isSaved ? "currentColor" : "none"} strokeWidth={2} />}
        label={isSaved ? "Tersimpan" : "Simpan"}
        onClick={onSave}
        disabled={isBusy}
      />
      <MenuItem
        icon={<MaterialIcon name="thumb_up" active={isLiked} />}
        label={isLiked ? "Liked" : "Like"}
        onClick={onLike}
        disabled={isBusy}
      />
      <MenuItem
        icon={<MaterialIcon name="thumb_down" active={isDisliked} />}
        label={isDisliked ? "Disliked" : "Dislike"}
        onClick={onDislike}
        disabled={isBusy}
      />
      {showAILabs && onAILabs && (
        <>
          <div className="my-1 mx-3 border-t border-border" />
          <MenuItem
            icon={isLoadingAILabs
              ? <Loader2 size={17} className="animate-spin text-foreground" />
              : <img src={opusFableIcon.url} alt="Opus Fable" className="h-full w-full rounded-full object-cover" />
            }
            label={isLoadingAILabs ? "Memuat AI..." : "Opus Fable"}
            onClick={onAILabs}
            disabled={isBusy}
            bigIcon={!isLoadingAILabs}
          />
        </>
      )}
      <div className="my-1 mx-3 border-t border-border" />
      <MenuItem
        icon={isLoadingLyrics ? <Loader2 size={17} className="animate-spin text-foreground" /> : <Music size={17} />}
        label={isLoadingLyrics ? "Memuat lirik..." : "Lyrics"}
        onClick={onLyrics}
        disabled={isBusy}
      />
    </div>,
    document.body
  );
};

export default FloatingMenu;
