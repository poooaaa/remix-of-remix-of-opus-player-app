import { useState, useRef, useCallback, useEffect } from "react";
import { Users } from "lucide-react";

interface LoginSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onFakeLogin: () => void;
}

const LoginSheet = ({ isVisible, onClose, onFakeLogin }: LoginSheetProps) => {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const startY = useRef(0);

  const handleDragStart = useCallback((clientY: number) => {
    setIsDragging(true);
    startY.current = clientY;
    setDragY(0);
  }, []);

  const handleDragMove = useCallback((clientY: number) => {
    if (!isDragging) return;
    const diff = clientY - startY.current;
    setDragY(Math.max(0, diff));
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    if (dragY > 80) {
      onClose();
    }
    setDragY(0);
  }, [dragY, onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    handleDragStart(e.touches[0].clientY);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    handleDragMove(e.touches[0].clientY);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    handleDragEnd();
  };

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleDragStart(e.clientY);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      handleDragMove(e.clientY);
    };
    const onUp = (e: MouseEvent) => {
      e.preventDefault();
      handleDragEnd();
    };
    window.addEventListener("mousemove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isVisible]);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    // Simulate a brief loading delay
    await new Promise(resolve => setTimeout(resolve, 1200));
    onFakeLogin();
    setIsLoading(false);
    onClose();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50" onTouchMove={(e) => e.stopPropagation()}>
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      />

      <div
        className="absolute left-0 right-0 bottom-0 pointer-events-auto"
        style={{
          height: "auto",
          maxHeight: "50vh",
          transform: `translateY(${isDragging ? dragY : 0}px)`,
          transition: isDragging ? "none" : "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div
          className="flex items-center justify-center pt-4 pb-3 cursor-grab active:cursor-grabbing rounded-t-2xl bg-muted border-t border-x border-border"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
        >
          <div className="w-20 h-1 rounded-full bg-muted-foreground/40" />
        </div>

        <div className="bg-muted border-x border-border px-6 pb-8 flex flex-col items-center gap-5">
          <div className="text-center mt-2">
            <h3 className="text-sm font-bold text-foreground">Bergabung ke komunitas</h3>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Gabung untuk menikmati semua fitur
            </p>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full max-w-[280px] flex items-center justify-center gap-3 px-5 py-3 bg-secondary hover:bg-secondary/80 border border-border rounded-full transition-all duration-200 active:scale-[0.97] disabled:opacity-50"
          >
            <Users className="w-[18px] h-[18px] text-foreground" />
            <span className="text-xs font-semibold text-foreground">
              {isLoading ? "Memproses..." : "Bergabung ke komunitas"}
            </span>
          </button>

          <button
            onClick={onClose}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Lewati
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginSheet;
