import { Search, UserRound } from "lucide-react";
import { useRef, useCallback, useState } from "react";
import SearchSuggestions from "@/components/SearchSuggestions";

interface SearchHeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: (overrideQuery?: string) => void;
  userAvatar?: string | null;
  userName?: string | null;
  onProfileClick: () => void;
  onLongPressProfile: () => void;
  hasGoogleRing?: boolean;
}

const SearchHeader = ({ query, onQueryChange, onSearch, userAvatar, userName, onProfileClick, onLongPressProfile, hasGoogleRing }: SearchHeaderProps) => {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const [focused, setFocused] = useState(false);

  const startLongPress = useCallback(() => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPressProfile();
    }, 3000);
  }, [onLongPressProfile]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleProfileClick = useCallback(() => {
    if (!didLongPress.current) {
      onProfileClick();
    }
    didLongPress.current = false;
  }, [onProfileClick]);

  return (
    <div className="sticky top-0 z-20 pb-6 pt-1 bg-background flex items-center justify-between gap-3">
      <div className="relative flex items-center flex-grow">
        <div className="absolute left-4 z-10 flex items-center justify-center">
          <Search className="w-4 h-4 text-muted-foreground" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { setFocused(false); onSearch(); } }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder="Cari lagu kesukaanmu..."
          className="w-full py-2.5 pl-11 pr-4 bg-secondary/50 backdrop-blur-xl border border-border rounded-full outline-none placeholder-muted-foreground text-xs text-foreground transition-colors"
        />
        <SearchSuggestions
          query={query}
          visible={focused}
          onPick={(q) => {
            onQueryChange(q);
            setFocused(false);
            onSearch(q);
          }}
        />
      </div>

      <button
        onClick={handleProfileClick}
        onMouseDown={startLongPress}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
        className="flex-shrink-0"
      >
        <div className="relative flex items-center justify-center" style={{ width: 48, height: 48 }}>
          {hasGoogleRing && (
            <svg
              className="absolute inset-0"
              height="48"
              width="48"
              viewBox="0 0 108 108"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M3,54c0-8.21,1.95-15.96,5.4-22.83l-2.62-1.32c-3.67,7.29-5.74,15.51-5.74,24.23 c0,9.01,2.22,17.49,6.12,24.96l2.66-1.4C5.11,70.56,3,62.53,3,54z" fill="#F6AD01" />
              <path d="M90.22,94.16l-2.07-2.28C79.11,100.03,67.13,105,54,105c-19.64,0-36.67-11.1-45.19-27.37l-2.66,1.4 c8.53,16.34,25.17,27.76,44.58,28.93h6.6C69.95,107.21,81.4,102.12,90.22,94.16z" fill="#249A41" />
              <path d="M108,52.89c-0.33-15.31-7.02-29.05-17.55-38.68l-2.01,2.17C98.61,25.71,105,39.11,105,54 c0,15.03-6.51,28.54-16.85,37.88l2.07,2.28c10.66-9.63,17.45-23.47,17.78-38.89V52.89z" fill="#3174F1" />
              <path d="M8.43,31.11C16.81,14.44,34.07,3,54,3c13.28,0,25.36,5.08,34.44,13.39l2.01-2.17 C80.85,5.44,68.06,0.08,54.03,0.08C32.95,0.08,14.7,12.17,5.8,29.79L8.43,31.11z" fill="#E92D18" />
            </svg>
          )}
          <div className={`rounded-full overflow-hidden flex items-center justify-center bg-secondary ${hasGoogleRing ? "w-[40px] h-[40px]" : "w-10 h-10 border border-border"}`}>
            {userAvatar ? (
              <img src={userAvatar} alt={userName || "Profile"} className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <UserRound className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>
    </div>
  );
};

export default SearchHeader;
