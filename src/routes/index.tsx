import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import SearchHeader from "@/components/SearchHeader";
import TrackCard, { type Track, parseDurationToMs, formatTime } from "@/components/TrackCard";
import TrackRowCard from "@/components/TrackRowCard";
import YouTubeCard, { type YouTubeVideo } from "@/components/YouTubeCard";
import LyricsSheet from "@/components/LyricsSheet";
import AILabsSheet from "@/components/AILabsSheet";
import SavedTracks from "@/components/SavedTracks";
import PopularArtists from "@/components/PopularArtists";
import FloatingMenu from "@/components/FloatingMenu";
import CookieSheet from "@/components/CookieSheet";
import GroqKeySheet from "@/components/GroqKeySheet";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
// Types haven't been regenerated for new tables yet; cast to any to bypass strict typing.
const supabase = supabaseTyped as any;
import SpinnerLogo from "@/components/SpinnerLogo";
import MusicPlayer from "@/components/MusicPlayer";
import YouTubeAudio, { type YTAudioHandle } from "@/components/YouTubeAudio";
import { preloadImages } from "@/lib/imagePreloader";

const POPULAR_ARTISTS = [
  "virgoun", "yovie widianto", "nadhif basalamah", "tulus", "nadin amizah", "hindia",
  "raim laode", "mahalini", "bernadya", "idgitaf", "pamungkas"
];
const GOOGLE_RING_DURATION_MS = 5 * 60 * 60 * 1000;
const GOOGLE_RING_PLAY_THRESHOLD = 5;

const parseYouTubeDurationSeconds = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
};

const proxyFetch = async (url: string) => {
  const { data, error } = await supabase.functions.invoke("proxy", { body: { url } });
  if (error) throw new Error("Proxy request failed");
  return data;
};

const shuffleArray = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};



const Index = () => {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const [playingTrackUrl, setPlayingTrackUrl] = useState<string | null>(null);
  const [loadingTrackUrl, setLoadingTrackUrl] = useState<string | null>(null);
  const [remainingTime, setRemainingTime] = useState<string | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const audioRef = useRef<YTAudioHandle | null>(null);
  const playbackRequestIdRef = useRef(0);

  const [lyrics, setLyrics] = useState<string | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [menuState, setMenuState] = useState<{ track: Track; position: { x: number; y: number } } | null>(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [lyricsTrack, setLyricsTrack] = useState<Track | null>(null);
  const [savedTracks, setSavedTracks] = useState<Track[]>([]);
  const [popularSongs, setPopularSongs] = useState<Track[]>([]);
  const [searchSections, setSearchSections] = useState<{ visualB: Track[]; untukAnda: Track[]; lainnya: Track[] }>({ visualB: [], untukAnda: [], lainnya: [] });

  // AI Labs state
  const [showAILabs, setShowAILabs] = useState(false);
  const [isLoadingAILabs, setIsLoadingAILabs] = useState(false);
  const [aiLabsSummary, setAiLabsSummary] = useState<string | null>(null);
  const [aiLabsArtistImage, setAiLabsArtistImage] = useState<string | null>(null);
  const [aiLabsArtistName, setAiLabsArtistName] = useState<string | null>(null);
  const [aiLabsArtistSongs, setAiLabsArtistSongs] = useState<any[]>([]);

  // Like/Dislike state (localStorage per device)
  const [likedTracks, setLikedTracks] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem("liked_tracks"); return s ? new Set(JSON.parse(s)) : new Set(); } catch { return new Set(); }
  });
  const [dislikedTracks, setDislikedTracks] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem("disliked_tracks"); return s ? new Set(JSON.parse(s)) : new Set(); } catch { return new Set(); }
  });

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [showCookieSheet, setShowCookieSheet] = useState(false);
  const [showGroqSheet, setShowGroqSheet] = useState(false);

  // Theme - always dark
  const theme = "dark";

  // Google ring - earned by playing any 5 songs
  const [totalPlays, setTotalPlays] = useState<number>(() => {
    const stored = localStorage.getItem("totalPlaysForRing");
    return stored ? parseInt(stored, 10) : 0;
  });
  const [googleRingExpiry, setGoogleRingExpiry] = useState<number>(() => {
    const stored = localStorage.getItem("googleRingExpiry");
    return stored ? parseInt(stored, 10) : 0;
  });

  // Auto-play queue for saved tracks
  const [autoPlayQueue, setAutoPlayQueue] = useState<Track[]>([]);
  const [autoPlayIndex, setAutoPlayIndex] = useState<number>(-1);

  const hasProfileGoogleRing = useMemo(() => {
    if (!user) return false;
    return googleRingExpiry > Date.now();
  }, [user, googleRingExpiry]);

  const closeAllMenus = useCallback(() => {
    setMenuState(null);
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    localStorage.removeItem("fake_user");
    const randomId = Math.random().toString(36).substring(2, 10);
    setUser({ id: randomId, name: `User_${randomId.slice(0, 4)}`, avatar_url: "" });
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("saved_tracks");
      if (stored) {
        const parsed = JSON.parse(stored);
        setSavedTracks(parsed);
        preloadImages(parsed.map((s: any) => s.thumbnail));
      }
    } catch {}
  }, []);

  useEffect(() => {
    const fetchPopular = async () => {
      try {
        // Try loading from cached database first
        const { data: cached } = await supabase
          .from("popular_songs")
          .select("*")
          .order("position", { ascending: true });

        if (cached && cached.length > 0) {
          const songs: Track[] = cached.map((item: any) => ({
            title: item.title,
            thumbnail: item.thumbnail,
            duration: "",
            duration_ms: item.duration_ms || 0,
            track_url: item.track_url,
            artist: item.artist || "",
            source: "applemusic" as const,
          }));
          setPopularSongs(songs);
          preloadImages(songs.map(s => s.thumbnail));
          return;
        }

        // Fallback: fetch from API directly and trigger refresh
        const data = await proxyFetch("https://rss.applemarketingtools.com/api/v2/id/music/most-played/25/songs.json");
        if (data?.feed?.results) {
          const songsWithDuration = await Promise.all(
            data.feed.results.map(async (item: any) => {
              let durationMs = 0;
              try {
                const searchData = await fetch(
                  `https://itunes.apple.com/search?term=${encodeURIComponent(item.artistName + " " + item.name)}&entity=song&limit=1`
                ).then(r => r.json());
                if (searchData?.results?.[0]?.trackTimeMillis) durationMs = searchData.results[0].trackTimeMillis;
              } catch {}
              return {
                title: `${item.artistName} - ${item.name}`,
                thumbnail: item.artworkUrl100?.replace("100x100bb", "600x600bb") || "",
                duration: "",
                duration_ms: durationMs,
                track_url: item.url || "",
                artist: item.artistName || "",
                source: "applemusic" as const,
              };
            })
          );
          setPopularSongs(songsWithDuration);
          preloadImages(songsWithDuration.map(s => s.thumbnail));
        }
        // Also trigger a background refresh to populate the DB
        supabase.functions.invoke("refresh-popular").catch(() => {});
      } catch (e) {
        console.error("Failed to fetch popular songs", e);
      }
    };
    fetchPopular();
  }, []);

  const handleSearch = useCallback(async (overrideQuery?: string) => {
    // Empty search = return to home
    const rawQuery = (overrideQuery ?? query).trim();
    if (!rawQuery) {
      setSearched(false);
      setTracks([]);
      setYoutubeVideos([]);
      setShowLyrics(false);
      setShowAILabs(false);
      setError("");
      closeAllMenus();
      return;
    }
    if (overrideQuery !== undefined) setQuery(overrideQuery);

    if (rawQuery.toLowerCase() === "#cookie") {
      setShowCookieSheet(true);
      setQuery("");
      return;
    }

    if (rawQuery.toLowerCase() === "#groq") {
      setShowGroqSheet(true);
      setQuery("");
      return;
    }


    setLoading(true);
    setError("");
    setSearched(true);
    setTracks([]);
    setSearchSections({ visualB: [], untukAnda: [], lainnya: [] });
    setYoutubeVideos([]);
    setShowLyrics(false);
    setShowAILabs(false);
    closeAllMenus();

    let searchTerm = rawQuery;
    try {
      const { data: smartData } = await supabase.functions.invoke("smart-search", {
        body: { query: searchTerm },
      });
      if (smartData?.result) {
        searchTerm = smartData.result;
        if (smartData.changed) setQuery(searchTerm);
      }
    } catch {}

    try {
      const [spotifyResult, appleMusicResult] = await Promise.allSettled([
        proxyFetch(`https://api.nexray.web.id/search/spotify?q=${encodeURIComponent(searchTerm)}`),
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=25`).then(r => r.json()),
      ]);

      const spotifyTracks: Track[] = [];
      const appleTracks: Track[] = [];

      if (spotifyResult.status === "fulfilled" && spotifyResult.value.result?.length > 0) {
        spotifyResult.value.result.forEach((item: any) => {
          spotifyTracks.push({
            title: item.title, thumbnail: item.thumbnail,
            duration: item.duration || "0:00", duration_ms: parseDurationToMs(item.duration || "0:00"),
            track_url: item.url || item.track_url, artist: item.artist || "", source: "spotify",
          });
        });
      }

      if (appleMusicResult.status === "fulfilled" && appleMusicResult.value.results?.length > 0) {
        appleMusicResult.value.results.forEach((item: any) => {
          appleTracks.push({
            title: `${item.artistName} - ${item.trackName}`,
            thumbnail: item.artworkUrl100?.replace("100x100", "600x600") || "",
            duration: "", duration_ms: item.trackTimeMillis || 0,
            track_url: item.trackViewUrl || "", artist: item.artistName || "", source: "applemusic",
          });
        });
      }

      // Separate best match per source for Visual B
      const bestSpotify = spotifyTracks[0] || null;
      const bestApple = appleTracks[0] || null;

      // "Untuk Anda" - top 2 from each source (skip first which is in Visual B)
      const untukAndaSpotify = user ? spotifyTracks.slice(1, 4) : spotifyTracks.slice(1, 2);
      const untukAndaApple = user ? appleTracks.slice(1, 4) : appleTracks.slice(1, 2);
      const untukAnda = shuffleArray([...untukAndaSpotify, ...untukAndaApple]);

      // "Lainnya" - remaining songs (shuffled!)
      const lainnyaStartSpotify = user ? 4 : 2;
      const lainnyaStartApple = user ? 4 : 2;
      const lainnyaSpotify = spotifyTracks.slice(lainnyaStartSpotify);
      const lainnyaApple = appleTracks.slice(lainnyaStartApple);
      let lainnya = shuffleArray([...lainnyaSpotify, ...lainnyaApple]);
      if (!user) lainnya = lainnya.slice(0, 4);

      // Visual B tracks (shuffled order)
      const visualBTracks: Track[] = shuffleArray([bestSpotify, bestApple].filter(Boolean) as Track[]);

      // Store sections in state so they don't re-shuffle on re-render
      setSearchSections({ visualB: visualBTracks, untukAnda, lainnya });

      // Build combined for legacy compatibility (playback etc)
      const combined = [...visualBTracks, ...untukAnda, ...lainnya];

      if (combined.length > 0) {
        setTracks(combined);
        preloadImages(combined.map(s => s.thumbnail));
        // Search YouTube with the same working search function used by the music player.
        const ytArtist = bestSpotify?.artist || bestApple?.artist || "";
        const ytTitle = bestSpotify 
          ? bestSpotify.title.replace(/^.+\s-\s/, "") 
          : bestApple 
            ? bestApple.title.replace(/^.+\s-\s/, "")
            : rawQuery;
        const ytQuery = `lagu ${ytTitle} by ${ytArtist} official music video`.trim();
        supabase.functions.invoke("youtube-search", {
          body: { query: ytQuery },
        }).then(({ data }: any) => {
          const results = data?.items || data?.results || data?.data || data?.result || [];
          // Score results by title similarity
          const searchLower = `${ytArtist} ${ytTitle}`.toLowerCase();
          const scored = results
            .filter((v: any) => {
              const dur = parseYouTubeDurationSeconds(v.duration_seconds ?? v.duration ?? v.timestamp ?? v.lengthSeconds);
              return dur !== null && dur > 0 && dur <= 600;
            })
            .map((v: any) => {
              const vTitle = (v.title || "").toLowerCase();
              // Count how many search words appear in video title
              const words = searchLower.split(/\s+/).filter(w => w.length > 2);
              const matchCount = words.filter(w => vTitle.includes(w)).length;
              return { v, score: matchCount };
            })
            .sort((a: any, b: any) => b.score - a.score);
          
          if (scored.length > 0) {
            const v = scored[0].v;
            setYoutubeVideos([{
              id: v.videoId || v.id || "",
              title: v.title || "",
              thumbnail: v.thumbnail || v.image || "",
              duration: v.timestamp || v.duration || v.duration_seconds || "",
              channel: v.author?.name || v.channel || v.artist || "",
              url: v.url || `https://youtube.com/watch?v=${v.videoId || v.id}`,
            }]);
          }
        }).catch(() => {});
      }
      else setError("Lagu tidak ditemukan");
    } catch {
      setError("Gagal terhubung, coba lagi");
    } finally {
      setLoading(false);
    }
  }, [query, user, closeAllMenus]);

  const fetchLyrics = useCallback(async (title: string, artist: string) => {
    try {
      const searchQ = `${title} ${artist}`.trim();
      const data = await proxyFetch(
        `https://opus-dev-v1.vercel.app/api/v1/search/lyric?q=${encodeURIComponent(searchQ)}`
      );
      const result = Array.isArray(data) ? data[0] : data;
      const lyric = result?.lirik || result?.lyrics || null;
      if (lyric) { setLyrics(String(lyric).replace(/\\n/g, "\n")); return; }
      setLyrics(null);
    } catch { setLyrics(null); }
  }, []);

  const extractYouTubeDurationSeconds = useCallback((item: any) => {
    const raw = item?.duration ?? item?.duration_seconds ?? item?.lengthSeconds ?? item?.length_seconds ?? item?.seconds;
    return parseYouTubeDurationSeconds(raw);
  }, []);

  // Search YouTube via youtube-search-api (server-side) for the best matching video ID
  const findYouTubeVideoId = useCallback(async (track: Track): Promise<string | null> => {
    try {
      const cleanTitle = track.title.replace(/^.+\s-\s/, "").trim();
      const artist = (track.artist || "").trim();
      const trackDurationSeconds = track.duration_ms > 0 ? track.duration_ms / 1000 : null;
      const ref = `${artist} ${cleanTitle}`.toLowerCase();
      const words = ref.split(/\s+/).filter((w) => w.length > 2);
      const queries = [
        `lagu spotify : ${cleanTitle} by ${artist}`,
        `lagu apple music : ${cleanTitle} by ${artist}`,
        `lagu ${artist} ${cleanTitle} audio`,
        `lagu ${artist} ${cleanTitle}`,
        `${artist} ${cleanTitle} official audio`,
        `${artist} ${cleanTitle} audio`,
      ].map((query) => query.trim()).filter(Boolean);

      let bestCandidate: { id: string | null; durationDiff: number; score: number } | null = null;

      for (const query of queries) {
        const { data, error } = await supabase.functions.invoke("youtube-search", {
          body: { query },
        });
        if (error) continue;

        const items: any[] = data?.items || [];
        if (items.length === 0) continue;

        const scored = items.map((it) => {
          const title = (it.title || "").toLowerCase();
          const matches = words.filter((w) => title.includes(w)).length;
          const durationSeconds = extractYouTubeDurationSeconds(it);
          const durationDiff = trackDurationSeconds == null || durationSeconds == null
            ? Number.POSITIVE_INFINITY
            : Math.abs(durationSeconds - trackDurationSeconds);

          return {
            it,
            score: matches,
            durationDiff,
            withinTolerance: durationDiff <= 1,
          };
        }).sort((a, b) => {
          if (a.withinTolerance !== b.withinTolerance) return a.withinTolerance ? -1 : 1;
          if (a.durationDiff !== b.durationDiff) return a.durationDiff - b.durationDiff;
          return b.score - a.score;
        });

        const strictDurationMatch = scored.find((item) => item.withinTolerance);
        if (strictDurationMatch) return strictDurationMatch.it?.id || null;

        const candidate = scored[0];
        if (!candidate) continue;

        if (
          !bestCandidate ||
          candidate.durationDiff < bestCandidate.durationDiff ||
          (candidate.durationDiff === bestCandidate.durationDiff && candidate.score > bestCandidate.score)
        ) {
          bestCandidate = {
            id: candidate.it?.id || null,
            durationDiff: candidate.durationDiff,
            score: candidate.score,
          };
        }
      }

      return bestCandidate?.id || null;
    } catch {
      return null;
    }
  }, [extractYouTubeDurationSeconds]);

  const handlePlayTrack = useCallback(async (track: Track) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playingTrackUrl === track.track_url) {
      audio.pause();
      setPlayingTrackUrl(null);
      setRemainingTime(null);
      setCurrentTrack(null);
      setAutoPlayQueue([]);
      setAutoPlayIndex(-1);
      return;
    }

    audio.pause();
    audio.unload();
    setPlayingTrackUrl(null);
    setLoadingTrackUrl(track.track_url);
    setRemainingTime(null);
    setCurrentTrack(track);

    playbackRequestIdRef.current += 1;
    const requestId = playbackRequestIdRef.current;
    const isStaleRequest = () => playbackRequestIdRef.current !== requestId;

    try {
      const videoId = await findYouTubeVideoId(track);
      if (isStaleRequest()) return;

      if (!videoId) {
        if (!isStaleRequest()) alert("Gagal menemukan audio untuk lagu ini");
        return;
      }

      await audio.load(videoId);
      if (isStaleRequest()) {
        audio.pause();
        return;
      }
      await audio.play();
      if (isStaleRequest()) {
        audio.pause();
        return;
      }

      setPlayingTrackUrl(track.track_url);
      setCurrentTrack(track);

      // Google ring tracking - any song counts
      if (user) {
        const newCount = totalPlays + 1;
        setTotalPlays(newCount);
        localStorage.setItem("totalPlaysForRing", String(newCount));
        if (newCount >= GOOGLE_RING_PLAY_THRESHOLD) {
          const expiry = Date.now() + GOOGLE_RING_DURATION_MS;
          setGoogleRingExpiry(expiry);
          localStorage.setItem("googleRingExpiry", String(expiry));
          setTotalPlays(0);
          localStorage.setItem("totalPlaysForRing", "0");
        }
      }
    } catch {
      if (!isStaleRequest()) alert("Gagal memutar lagu");
    } finally {
      if (!isStaleRequest()) {
        setLoadingTrackUrl(null);
      }
    }
  }, [playingTrackUrl, user, totalPlays, findYouTubeVideoId]);

  // Play saved track with auto-play queue — use current savedTracks order
  const handlePlaySavedTrack = useCallback((track: Track) => {
    const idx = savedTracks.findIndex(t => t.track_url === track.track_url);
    // Set queue to savedTracks in their current display order
    setAutoPlayQueue([...savedTracks]);
    setAutoPlayIndex(idx >= 0 ? idx : 0);
    handlePlayTrack(track);
  }, [savedTracks, handlePlayTrack]);

  const handleLongPress = useCallback((track: Track, position: { x: number; y: number }) => {
    closeAllMenus();
    setMenuState({ track, position });
  }, [closeAllMenus]);

  const getTrackKey = useCallback((t: Track) => {
    return `${(t.title || "").toLowerCase().trim()}::${(t.artist || "").toLowerCase().trim()}`;
  }, []);

  const handleSaveTrack = useCallback((track: Track) => {
    const key = getTrackKey(track);
    const alreadySaved = savedTracks.some(s => getTrackKey(s) === key);
    const updated = alreadySaved
      ? savedTracks.filter(s => getTrackKey(s) !== key)
      : [track, ...savedTracks];
    setSavedTracks(updated);
    preloadImages(updated.map(s => s.thumbnail));
    localStorage.setItem("saved_tracks", JSON.stringify(updated));
    setMenuState(null);
  }, [savedTracks, getTrackKey]);

  const handleLyricsFromMenu = useCallback(async () => {
    if (!menuState || isLoadingLyrics) return;
    const track = menuState.track;
    if (showLyrics) { setMenuState(null); setShowLyrics(false); return; }
    setIsLoadingLyrics(true);
    setLyricsTrack(track);
    const trackTitle = track.title.replace(/^.+\s-\s/, "");
    await fetchLyrics(trackTitle, track.artist || "");
    setIsLoadingLyrics(false);
    setMenuState(null);
    setShowLyrics(true);
  }, [menuState, showLyrics, fetchLyrics, isLoadingLyrics]);

  const handleAILabsFromMenu = useCallback(async () => {
    if (!menuState || isLoadingAILabs || !user) return;
    const track = menuState.track;
    if (showAILabs) { setMenuState(null); setShowAILabs(false); return; }
    setIsLoadingAILabs(true);
    const trackTitle = track.title.replace(/^.+\s-\s/, "");
    const artist = track.artist || "";
    try {
      const { data, error } = await supabase.functions.invoke("ai-labs", {
        body: { title: trackTitle, artist },
      });
      if (error) throw error;
      setAiLabsSummary(data?.summary || null);
      setAiLabsArtistImage(data?.artistImage || null);
      setAiLabsArtistName(data?.artistName || null);
      setAiLabsArtistSongs(data?.artistSongs || []);
    } catch (e) {
      console.error("AI Labs error:", e);
      setAiLabsSummary("Gagal memuat informasi.");
      setAiLabsArtistImage(null);
      setAiLabsArtistName(null);
      setAiLabsArtistSongs([]);
    }
    setIsLoadingAILabs(false);
    setMenuState(null);
    setShowAILabs(true);
  }, [menuState, showAILabs, isLoadingAILabs, user]);

  // Audio event callbacks (passed to YouTubeAudio)
  const handleAudioTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    let durationMs = currentTrack.duration_ms > 0
      ? currentTrack.duration_ms
      : parseDurationToMs(currentTrack.duration);
    if (!durationMs && audio.duration > 0) {
      durationMs = Math.floor(audio.duration * 1000);
    }
    if (!durationMs) return;
    const remainingMs = durationMs - audio.currentTime * 1000;
    setRemainingTime(formatTime(remainingMs));
  }, [currentTrack]);

  const handleAudioEnded = useCallback(() => {
    if (autoPlayQueue.length > 0 && autoPlayIndex >= 0 && autoPlayIndex < autoPlayQueue.length - 1) {
      const nextIndex = autoPlayIndex + 1;
      setAutoPlayIndex(nextIndex);
      const nextTrack = autoPlayQueue[nextIndex];
      setCurrentTrack(nextTrack);
      handlePlayTrack(nextTrack);
      return;
    }
    setPlayingTrackUrl(null);
    setRemainingTime(null);
    setCurrentTrack(null);
    setShowLyrics(false);
    setShowAILabs(false);
    setAutoPlayQueue([]);
    setAutoPlayIndex(-1);
  }, [autoPlayQueue, autoPlayIndex, handlePlayTrack]);

  // Google ring expiry check
  useEffect(() => {
    if (!googleRingExpiry) return;
    const interval = setInterval(() => {
      if (Date.now() > googleRingExpiry) { setGoogleRingExpiry(0); localStorage.removeItem("googleRingExpiry"); }
    }, 60000);
    return () => clearInterval(interval);
  }, [googleRingExpiry]);

  const userAvatar = user?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const userName = user?.name || user?.user_metadata?.full_name || user?.user_metadata?.name || null;

  const isTrackPlaying = useCallback((track: Track) => {
    if (!playingTrackUrl || !currentTrack) return false;
    if (playingTrackUrl === track.track_url) return true;
    const a = `${(track.title || "").toLowerCase().trim()}::${(track.artist || "").toLowerCase().trim()}`;
    const b = `${(currentTrack.title || "").toLowerCase().trim()}::${(currentTrack.artist || "").toLowerCase().trim()}`;
    return a === b;
  }, [playingTrackUrl, currentTrack]);

  const isTrackLoading = useCallback((track: Track) => {
    if (!loadingTrackUrl) return false;
    return loadingTrackUrl === track.track_url;
  }, [loadingTrackUrl]);

  const renderTrackCard = (track: Track, i: number, fromSaved?: boolean) => (
    <TrackCard
      key={track.track_url + i}
      track={track}
      isPlaying={isTrackPlaying(track)}
      isLoading={isTrackLoading(track)}
      remainingTime={isTrackPlaying(track) ? remainingTime : null}
      onPlay={() => fromSaved ? handlePlaySavedTrack(track) : handlePlayTrack(track)}
      onLongPress={(pos) => handleLongPress(track, pos)}
    />
  );

  return (
    <div className="min-h-screen overflow-x-hidden flex justify-center">
      <div className="w-full max-w-md px-4 pt-2 pb-4">
        <SearchHeader
          query={query}
          onQueryChange={setQuery}
          onSearch={handleSearch}
          onHomeClick={() => { setQuery(""); handleSearch(); }}
        />

        {!searched && (
          <>
            {savedTracks.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-bold text-foreground mb-4">Lagu favorite</h2>
                <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: "none" }}>
                  {savedTracks.map((track, i) => (
                    <div key={track.track_url} className="flex-shrink-0 w-[calc(50%-8px)]">
                      {renderTrackCard(track, i, true)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-6">
              <h2 className="text-lg font-bold text-foreground mb-4">Artis populer</h2>
              <PopularArtists />
            </div>

            {popularSongs.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-bold text-foreground mb-4">Sedang Populer</h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-10">
                  {(user ? popularSongs : popularSongs.slice(0, 7)).map((track, i) => renderTrackCard(track, i))}
                </div>
              </div>
            )}

          </>
        )}

        {loading && (
          <div className="flex justify-center py-10">
            <SpinnerLogo size={56} />
          </div>
        )}

        {error && (
          <p className="text-center py-10 text-[10px] text-destructive opacity-70 tracking-widest uppercase">
            {error}
          </p>
        )}

        {searched && !loading && tracks.length > 0 && (
            <>
              {/* YouTube Video */}
              {youtubeVideos.length > 0 && (
                <div className="mb-4 pb-4 border-b border-border/20">
                   {youtubeVideos.map((video) => (
                     <YouTubeCard
                       key={video.id}
                       video={video}
                     />
                  ))}
                </div>
              )}

              {/* Visual B - 2 best matches under YouTube */}
              {searchSections.visualB.length > 0 && (
                <div className="mb-4">
                  {searchSections.visualB.map((track, i) => (
                    <TrackRowCard
                      key={track.track_url + "vb" + i}
                      track={track}
                      isPlaying={isTrackPlaying(track)}
                      isLoading={isTrackLoading(track)}
                      onPlay={() => handlePlayTrack(track)}
                      onLongPress={(pos) => handleLongPress(track, pos)}
                    />
                  ))}
                </div>
              )}

              {/* Untuk Anda */}
              {searchSections.untukAnda.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-lg font-bold text-foreground mb-4">Untuk Anda</h2>
                  <div 
                    className="flex gap-4 pb-2 overflow-x-auto" 
                    style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
                  >
                    {searchSections.untukAnda.map((track, i) => (
                      <div key={track.track_url + "ua" + i} className="flex-shrink-0 w-[calc(50%-8px)]">
                        {renderTrackCard(track, i)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lainnya */}
              {searchSections.lainnya.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-lg font-bold text-foreground mb-4">Lagu Lainnya</h2>
                  {searchSections.lainnya.map((track, i) => (
                    <TrackRowCard
                      key={track.track_url + "ln" + i}
                      track={track}
                      isPlaying={isTrackPlaying(track)}
                      isLoading={isTrackLoading(track)}
                      onPlay={() => handlePlayTrack(track)}
                      onLongPress={(pos) => handleLongPress(track, pos)}
                    />
                  ))}
                </div>
              )}
            </>
        )}

        <YouTubeAudio ref={audioRef} onEnded={handleAudioEnded} onTimeUpdate={handleAudioTimeUpdate} />

        {currentTrack && (
          <MusicPlayer
            track={currentTrack}
            isPlaying={!!playingTrackUrl && playingTrackUrl === currentTrack.track_url}
            isLoading={!!loadingTrackUrl && loadingTrackUrl === currentTrack.track_url}
            onTogglePlay={() => {
              const audio = audioRef.current;
              if (!audio) return;
              if (playingTrackUrl === currentTrack.track_url) {
                audio.pause();
                setPlayingTrackUrl(null);
              } else {
                audio.play().then(() => {
                  setPlayingTrackUrl(currentTrack.track_url);
                }).catch(() => {});
              }
            }}
            onClose={() => {
              const audio = audioRef.current;
              if (audio) {
                audio.pause();
                audio.unload();
              }
              // Cancel any in-flight playback request so loading state stops
              playbackRequestIdRef.current += 1;
              setLoadingTrackUrl(null);
              setPlayingTrackUrl(null);
              setCurrentTrack(null);
              setRemainingTime(null);
              setAutoPlayQueue([]);
              setAutoPlayIndex(-1);
            }}
          />
        )}

        {currentTrack && <div className="h-20" aria-hidden />}

        <LyricsSheet 
          lyrics={lyrics} 
          isVisible={showLyrics} 
          onClose={() => setShowLyrics(false)} 
          trackTitle={lyricsTrack?.title?.replace(/^.+\s-\s/, "") || ""}
          trackArtist={lyricsTrack?.artist || ""}
          audioRef={audioRef}
        />

        <AILabsSheet
          isVisible={showAILabs}
          onClose={() => setShowAILabs(false)}
          summary={aiLabsSummary}
          artistImage={aiLabsArtistImage}
          artistName={aiLabsArtistName}
          artistSongs={aiLabsArtistSongs}
          isLoading={isLoadingAILabs}
        />

        {menuState && (
          <FloatingMenu
            position={menuState.position}
            onClose={() => setMenuState(null)}
            onSave={() => handleSaveTrack(menuState.track)}
            onLike={() => {
              const url = menuState.track.track_url;
              const newLiked = new Set(likedTracks);
              const newDisliked = new Set(dislikedTracks);
              if (newLiked.has(url)) { newLiked.delete(url); } else { newLiked.add(url); newDisliked.delete(url); }
              setLikedTracks(newLiked);
              setDislikedTracks(newDisliked);
              localStorage.setItem("liked_tracks", JSON.stringify([...newLiked]));
              localStorage.setItem("disliked_tracks", JSON.stringify([...newDisliked]));
            }}
            onDislike={() => {
              const url = menuState.track.track_url;
              const newLiked = new Set(likedTracks);
              const newDisliked = new Set(dislikedTracks);
              if (newDisliked.has(url)) { newDisliked.delete(url); } else { newDisliked.add(url); newLiked.delete(url); }
              setLikedTracks(newLiked);
              setDislikedTracks(newDisliked);
              localStorage.setItem("liked_tracks", JSON.stringify([...newLiked]));
              localStorage.setItem("disliked_tracks", JSON.stringify([...newDisliked]));
            }}
            onLyrics={handleLyricsFromMenu}
            onAILabs={handleAILabsFromMenu}
            isSaved={savedTracks.some(s => getTrackKey(s) === getTrackKey(menuState.track))}
            isLiked={likedTracks.has(menuState.track.track_url)}
            isDisliked={dislikedTracks.has(menuState.track.track_url)}
            isLoadingLyrics={isLoadingLyrics}
            isLoadingAILabs={isLoadingAILabs}
            showAILabs={!!user}
          />
        )}


        <CookieSheet open={showCookieSheet} onClose={() => setShowCookieSheet(false)} />
        <GroqKeySheet open={showGroqSheet} onClose={() => setShowGroqSheet(false)} />


      </div>
    </div>
  );
};

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Opus Music — Stream & Discover" },
      { name: "description", content: "Search and stream millions of songs from Spotify, Apple Music, and YouTube." },
      { property: "og:title", content: "Opus Music — Stream & Discover" },
      { property: "og:description", content: "Search and stream millions of songs from Spotify, Apple Music, and YouTube." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

export default Index;
