import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface YTAudioHandle {
  currentTime: number;
  duration: number;
  load: (videoId: string) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  unload: () => void;
}

interface Props {
  onEnded?: () => void;
  onTimeUpdate?: () => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;
const loadYouTubeAPI = (): Promise<void> => {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiPromise;
};

const YouTubeAudio = forwardRef<YTAudioHandle, Props>(({ onEnded, onTimeUpdate }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const readyRef = useRef(false);
  const pendingVideoRef = useRef<string | null>(null);
  const tickRef = useRef<number | null>(null);
  const wasPlayingRef = useRef(false);
  const userPausedRef = useRef(false);
  const playWaitersRef = useRef<Array<() => void>>([]);
  const onEndedRef = useRef(onEnded);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onEndedRef.current = onEnded;
  onTimeUpdateRef.current = onTimeUpdate;

  useEffect(() => {
    let cancelled = false;
    loadYouTubeAPI().then(() => {
      if (cancelled || !containerRef.current) return;
      const inner = document.createElement("div");
      containerRef.current.appendChild(inner);
      playerRef.current = new window.YT.Player(inner, {
        height: "1",
        width: "1",
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          disablekb: 1,
          fs: 0,
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            if (pendingVideoRef.current) {
              const vid = pendingVideoRef.current;
              pendingVideoRef.current = null;
              try { playerRef.current.loadVideoById(vid); } catch {}
            }
          },
          onStateChange: (e: any) => {
            const YT = window.YT;
            if (!YT) return;
            if (e.data === YT.PlayerState.ENDED) {
              wasPlayingRef.current = false;
              onEndedRef.current?.();
            }
            if (e.data === YT.PlayerState.PLAYING) {
              wasPlayingRef.current = true;
              try { durationRef.current = playerRef.current.getDuration() || 0; } catch {}
              const waiters = playWaitersRef.current;
              playWaitersRef.current = [];
              waiters.forEach((fn) => fn());
            }
            if (e.data === YT.PlayerState.PAUSED) {
              // If pause happens while tab hidden, browser/YT auto-paused — resume it.
              if (document.hidden && wasPlayingRef.current && !userPausedRef.current) {
                try { playerRef.current?.playVideo?.(); } catch {}
              }
            }
          },
        },
      });
    });

    const tick = () => {
      try {
        if (playerRef.current?.getCurrentTime) {
          currentTimeRef.current = playerRef.current.getCurrentTime() || 0;
          onTimeUpdateRef.current?.();
        }
      } catch {}
      tickRef.current = window.setTimeout(tick, 250);
    };
    tickRef.current = window.setTimeout(tick, 250);

    // Keep audio alive when tab is hidden / window blurred — resume if YT auto-paused.
    const resumeIfNeeded = () => {
      if (!wasPlayingRef.current || userPausedRef.current) return;
      try {
        const YT = window.YT;
        const state = playerRef.current?.getPlayerState?.();
        if (YT && state !== undefined && state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
          playerRef.current?.playVideo?.();
        }
      } catch {}
    };
    const onVisibility = () => { resumeIfNeeded(); };
    const onBlur = () => { setTimeout(resumeIfNeeded, 200); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", resumeIfNeeded);
    const keepAlive = window.setInterval(resumeIfNeeded, 2000);

    return () => {
      cancelled = true;
      if (tickRef.current) clearTimeout(tickRef.current);
      clearInterval(keepAlive);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", resumeIfNeeded);
      try { playerRef.current?.destroy?.(); } catch {}
      playerRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    get currentTime() { return currentTimeRef.current; },
    get duration() { return durationRef.current; },
    load: async (videoId: string) => {
      currentTimeRef.current = 0;
      durationRef.current = 0;
      userPausedRef.current = false;
      if (!readyRef.current || !playerRef.current) {
        pendingVideoRef.current = videoId;
        return;
      }
      try { playerRef.current.loadVideoById(videoId); } catch {}
    },
    play: async () => {
      userPausedRef.current = false;
      try { playerRef.current?.playVideo?.(); } catch {}
      // Wait until YouTube reports PLAYING so caller can sync UI with actual audio start.
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => { if (done) return; done = true; resolve(); };
        playWaitersRef.current.push(finish);
        // Safety timeout so we don't hang forever if state event is missed.
        setTimeout(finish, 4000);
      });
    },
    pause: () => {
      userPausedRef.current = true;
      wasPlayingRef.current = false;
      try { playerRef.current?.pauseVideo?.(); } catch {}
    },
    unload: () => {
      currentTimeRef.current = 0;
      durationRef.current = 0;
      pendingVideoRef.current = null;
      userPausedRef.current = true;
      wasPlayingRef.current = false;
      try { playerRef.current?.stopVideo?.(); } catch {}
    },
  }), []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      style={{
        position: "fixed",
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: "none",
        left: -9999,
        top: -9999,
      }}
    />
  );
});

YouTubeAudio.displayName = "YouTubeAudio";
export default YouTubeAudio;
