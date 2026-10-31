import { Home } from "lucide-react";

interface SearchHeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: (overrideQuery?: string) => void;
  onHomeClick: () => void;
}

const SearchHeader = ({ query, onQueryChange, onSearch, onHomeClick }: SearchHeaderProps) => {
  return (
    <div className="sticky top-0 z-20 pb-6 pt-1 bg-background flex items-center justify-between gap-3">
      <div className="relative flex items-center flex-grow">
        <div className="absolute left-4 z-10 flex items-center justify-center">
          <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
          placeholder="Cari lagu kesukaanmu..."
          className="w-full py-2.5 pl-11 pr-4 bg-secondary/50 backdrop-blur-xl border border-border rounded-full outline-none placeholder-muted-foreground text-xs text-foreground transition-colors"
        />
      </div>

      <button
        onClick={onHomeClick}
        aria-label="Kembali ke menu home"
        className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full border border-border bg-secondary/50 text-foreground transition-colors active:bg-muted"
      >
        <Home size={18} />
      </button>
    </div>
  );
};

export default SearchHeader;
