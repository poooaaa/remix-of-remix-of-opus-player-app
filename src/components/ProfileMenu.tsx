import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LogOut } from "lucide-react";

interface ProfileMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onLogout: () => void;
}

const ProfileMenu = ({ position, onClose, onLogout }: ProfileMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleScroll = () => onClose();
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClick);
      window.addEventListener("scroll", handleScroll, true);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  const adjustedX = Math.min(Math.max(8, position.x), window.innerWidth - 176);
  const adjustedY = Math.min(Math.max(8, position.y), window.innerHeight - 60);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 bg-background/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl py-2 min-w-[160px] animate-scale-in origin-top-right"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <button
        className="w-full flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium text-foreground/80 hover:text-foreground hover:bg-muted transition-all duration-150"
        onClick={onLogout}
      >
        <LogOut size={14} />
        Logout
      </button>
    </div>,
    document.body
  );
};

export default ProfileMenu;
