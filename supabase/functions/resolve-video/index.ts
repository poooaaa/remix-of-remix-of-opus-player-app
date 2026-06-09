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

// ---- y2mp3.co downloader integration ----

async function startDownload(
  url: string,
  quality: string,
): Promise<string | null> {
  const res = await fetch("https://ytdl.y2mp3.co/api/v2/download", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: normalizeUrl(url),
      output: { type: "video", format: "mp4", quality },
    }),
  });
  const data = await res.json().catch(() => null);
  return data?.statusUrl || null;
}

async function pollStatus(statusUrl: string): Promise<string> {
  const id = statusUrl.split("/").pop();
  for (let attempts = 0; attempts < 30; attempts++) {
    const res = await fetch(`https://ytdl.y2mp3.co/api/status/${id}`, {
      headers: { Accept: "application/json" },
    });
    const result = await res.json().catch(() => ({}));
    if (result.status === "completed" && result.downloadUrl) {
      return result.downloadUrl;
    }
    if (result.status === "failed") {
      throw new Error("Server konversi video melaporkan kegagalan.");
    }
    await sleep(3000);
  }
  throw new Error("Waktu tunggu konversi lewat batas (Timeout). Silakan coba lagi.");
}

// Download a given quality and return the bytes
async function fetchQuality(
  url: string,
  quality: string,
): Promise<Uint8Array | null> {
  const statusUrl = await startDownload(url, quality);
  if (!statusUrl) return null;
  const downloadUrl = await pollStatus(statusUrl);
  const fileRes = await fetch(downloadUrl);
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

    // 2. Fetch video info from ytdown
    const raw = await ytdown(normalizedUrl);
    if (!raw?.api || raw.api.status !== "ok") {
      return json(
        { error: "Gagal mengambil detail video. Pastikan URL YouTube valid." },
        400,
      );
    }
    const apiInfo = raw.api;

    const durationStr = apiInfo.mediaStats?.duration || "";
    if (parseDurationToSeconds(durationStr) > 600) {
      return json(
        { error: "Durasi video melebihi batas 10 menit." },
        400,
      );
    }

    const videos = (apiInfo.mediaItems || []).filter(
      (i: any) => i.type === "Video",
    );
    if (videos.length === 0) {
      return json({ error: "Tidak ditemukan format video yang bisa diunduh." }, 400);
    }

    // 3. Resolution selection: below 30MB -> max 720p, above 30MB -> max 480p
    const processed = videos
      .map((v: any) => ({
        item: v,
        height: getResolutionHeight(v),
        sizeMB: parseSizeToMB(v.mediaFileSize),
      }))
      .filter((v: any) => v.height > 0);

    const eligible = processed.filter((v: any) =>
      v.sizeMB > SIZE_LIMIT_MB ? v.height <= 480 : v.height <= 720,
    );
    const pool = eligible.length > 0 ? eligible : processed;
    // Prefer highest allowed quality
    pool.sort((a: any, b: any) => b.height - a.height);
    const selected = pool[0];
    const resolution = `${selected.height}p`;

    // 4. Resolve real file URL + download bytes
    const realUrl = await resolveRealVideoUrl(selected.item.mediaUrl);
    const fileRes = await fetch(realUrl, {
      headers: {
        "User-Agent": UA,
        Referer: "https://app.ytdown.to/",
        Origin: "https://app.ytdown.to",
      },
    });
    const ct = fileRes.headers.get("content-type") || "";
    if (ct.includes("text/html") || ct.includes("application/json")) {
      return json(
        { error: "Tautan video kedaluwarsa atau diblokir. Silakan coba lagi." },
        502,
      );
    }
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    if (bytes.byteLength < 1000) {
      return json({ error: "Hasil unduhan rusak/terlalu kecil. Coba lagi." }, 502);
    }

    // 5. Upload to storage bucket
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
      title: apiInfo.title,
      thumbnail: apiInfo.imagePreviewUrl || "",
      resolution,
    });
  } catch (error) {
    return json({ error: (error as Error).message || "Request failed" }, 500);
  }
});
