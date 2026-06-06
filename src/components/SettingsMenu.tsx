import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Info, Key, Bug, Award, Moon, Sun } from "lucide-react";

interface SettingsMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  isLoggedIn: boolean;
  theme: "dark" | "light";
  onToggleTheme: (theme: "dark" | "light") => void;
}

const SettingsMenu = ({ position, onClose, isLoggedIn, theme, onToggleTheme }: SettingsMenuProps) => {
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

  const adjustedX = Math.min(Math.max(8, position.x - 10), window.innerWidth - 176);
  const adjustedY = Math.min(Math.max(8, position.y), window.innerHeight - 260);

  const menuItems = [
    { icon: <Info size={14} />, label: "Information" },
    ...(isLoggedIn ? [{ icon: <Key size={14} />, label: "Api Key" }] : []),
    { icon: <Bug size={14} />, label: "Bug Report" },
    { icon: <Award size={14} />, label: "Credits" },
  ];

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 bg-background/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl py-2 min-w-[160px] animate-scale-in origin-top-left"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {menuItems.map((item, i) => (
        <button
          key={i}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium text-foreground/80 hover:text-foreground hover:bg-muted transition-all duration-150"
          onClick={onClose}
        >
          {item.icon}
          {item.label}
        </button>
      ))}

      <div className="my-1 mx-3 border-t border-border" />

      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => onToggleTheme("dark")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-medium transition-all duration-150 ${
            theme === "dark"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Moon size={12} />
          Dark
        </button>
        <button
          onClick={() => onToggleTheme("light")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-medium transition-all duration-150 ${
            theme === "light"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sun size={12} />
          Light
        </button>
      </div>
    </div>,
    document.body
  );
};

export default SettingsMenu;
