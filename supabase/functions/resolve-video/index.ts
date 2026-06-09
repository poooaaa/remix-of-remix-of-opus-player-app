import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "yt-videos";
const MAX_CACHED = 3; // keep only the newest 3 videos
const SIZE_LIMIT_MB = 30; // <=30MB -> 720p allowed, otherwise fall back to 480p
const SIGN_EXPIRY = 60 * 60 * 24 * 7; // 7 days

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const admin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Normalize a YouTube URL to the canonical watch?v= form
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return "https://www.youtube.com/watch?v=" + u.pathname.slice(1);
    }
    const v = u.searchParams.get("v");
    if (v) return "https://www.youtube.com/watch?v=" + v;
    const shorts = u.pathname.match(/\/shorts\/([\w-]{11})/);
    if (shorts) return "https://www.youtube.com/watch?v=" + shorts[1];
    return url;
  } catch {
    return url;
  }
}

// ---- davidcyriltech downloader integration (server-friendly, no Cloudflare block) ----

// Resolve a direct download URL for the given quality ("720" or "360").
async function resolveDownloadUrl(
  url: string,
  quality: string,
): Promise<string | null> {
  const target = normalizeUrl(url);
  const endpoints = [
    `https://apis.davidcyriltech.my.id/download/ytmp4?url=${encodeURIComponent(target)}&quality=${quality}`,
    `https://apis.davidcyriltech.my.id/youtube/mp4?url=${encodeURIComponent(target)}`,
  ];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, { headers: { Accept: "application/json" } });
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) continue;
      const data = await res.json().catch(() => null);
      const dl = data?.result?.download_url || data?.result?.url;
      if (dl && typeof dl === "string") return dl;
    } catch {
      // try next endpoint
    }
  }
  return null;
}

// Download a given quality and return the bytes
async function fetchQuality(
  url: string,
  quality: string,
): Promise<Uint8Array | null> {
  const downloadUrl = await resolveDownloadUrl(url, quality);
  if (!downloadUrl) return null;
  const fileRes = await fetch(downloadUrl, { redirect: "follow" });
  const ct = fileRes.headers.get("content-type") || "";
  if (ct.includes("text/html") || ct.includes("application/json")) return null;
  const bytes = new Uint8Array(await fileRes.arrayBuffer());
  if (bytes.byteLength < 1000) return null;
  return bytes;
}

// Keep only the newest MAX_CACHED videos: delete the oldest from storage + table
async function evictOldVideos(db: ReturnType<typeof admin>) {
  const { data: rows } = await db
    .from("cached_videos")
    .select("id, storage_path")
    .order("created_at", { ascending: false });
  if (!rows || rows.length <= MAX_CACHED) return;
  const stale = rows.slice(MAX_CACHED);
  if (stale.length === 0) return;
  const paths = stale.map((r) => r.storage_path).filter(Boolean);
  if (paths.length) await db.storage.from(BUCKET).remove(paths);
  await db
    .from("cached_videos")
    .delete()
    .in("id", stale.map((r) => r.id));
}

async function signedUrlFor(db: ReturnType<typeof admin>, path: string) {
  const { data } = await db.storage.from(BUCKET).createSignedUrl(path, SIGN_EXPIRY);
  return data?.signedUrl || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return json({ error: "Missing url" }, 400);
    }

    const db = admin();
    const normalizedUrl = url.trim();

    // 1. Cache hit: reuse stored video
    const { data: cached } = await db
      .from("cached_videos")
      .select("storage_path")
      .eq("video_url", normalizedUrl)
      .maybeSingle();
    if (cached?.storage_path) {
      const signed = await signedUrlFor(db, cached.storage_path);
      if (signed) return json({ previewUrl: signed, cached: true });
    }

    // 2. Download via y2mp3.co — start at 720p.
    //    Rule: <=30MB keeps 720p, otherwise re-download at 480p.
    const SIZE_LIMIT_BYTES = SIZE_LIMIT_MB * 1024 * 1024;
    let resolution = "720p";
    let bytes = await fetchQuality(normalizedUrl, "720p");
    if (!bytes) {
      return json(
        { error: "Gagal mengunduh video. Pastikan URL YouTube valid." },
        502,
      );
    }
    if (bytes.byteLength > SIZE_LIMIT_BYTES) {
      const smaller = await fetchQuality(normalizedUrl, "480p");
      if (smaller) {
        bytes = smaller;
        resolution = "480p";
      }
    }

    // 3. Upload to storage bucket
    const videoId =
      normalizedUrl.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] ||
      Math.random().toString(36).slice(2, 13);
    const storagePath = `${videoId}_${resolution}_${Date.now()}.mp4`;
    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: "video/mp4", upsert: true });
    if (upErr) {
      return json({ error: "Gagal menyimpan video: " + upErr.message }, 500);
    }

    // 6. Record in cache + evict old (keep newest 3)
    await db
      .from("cached_videos")
      .upsert(
        { video_url: normalizedUrl, storage_path: storagePath },
        { onConflict: "video_url" },
      );
    await evictOldVideos(db);

    const signed = await signedUrlFor(db, storagePath);
    if (!signed) {
      return json({ error: "Gagal membuat tautan pemutaran." }, 500);
    }

    return json({
      previewUrl: signed,
      resolution,
    });
  } catch (error) {
    return json({ error: (error as Error).message || "Request failed" }, 500);
  }
});
