import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "yt-videos";
const MAX_CACHED = 3; // keep only the newest 3 videos
const SIZE_LIMIT_MB = 30; // below 30MB -> max 720p, above 30MB -> max 480p
const SIGN_EXPIRY = 60 * 60 * 24 * 7; // 7 days

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36";

const admin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

function parseDurationToSeconds(duration: unknown): number {
  if (duration === null || duration === undefined) return 0;
  if (typeof duration === "number") return duration;
  const str = String(duration).trim();
  if (!str) return 0;
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  if (/^(\d+:)?\d+:\d+$/.test(str)) {
    const parts = str.split(":").map((p) => parseInt(p, 10));
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  return 0;
}

function getResolutionHeight(item: any): number {
  if (item.mediaRes && typeof item.mediaRes === "string") {
    const parts = item.mediaRes.split("x");
    if (parts.length === 2) {
      const h = parseInt(parts[1], 10);
      if (!isNaN(h)) return h;
    }
  }
  if (item.mediaUrl && typeof item.mediaUrl === "string") {
    const match = item.mediaUrl.match(/\/(\d+)p$/);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}

function parseSizeToMB(sizeStr: string): number {
  if (!sizeStr) return 0;
  const str = sizeStr.trim().toLowerCase();
  const numMatch = str.match(/^([\d.]+)/);
  if (!numMatch) return 0;
  const value = parseFloat(numMatch[1]);
  if (isNaN(value)) return 0;
  if (str.includes("gb")) return value * 1024;
  if (str.includes("kb")) return value / 1024;
  return value;
}

// YouTube downloader integration (ytdown.to)
async function ytdown(url: string): Promise<any> {
  const body = new URLSearchParams({ url }).toString();
  const res = await fetch("https://app.ytdown.to/proxy.php", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "x-requested-with": "XMLHttpRequest",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: "https://app.ytdown.to",
      referer: "https://app.ytdown.to/id23/",
    },
    body,
  });
  return await res.json();
}

// Resolve the real downloadable file URL from the ytdown proxy media URL
async function resolveRealVideoUrl(mediaUrl: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(mediaUrl, {
      headers: {
        "User-Agent": UA,
        Referer: "https://app.ytdown.to/",
        Origin: "https://app.ytdown.to",
      },
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      // Direct binary stream — return the URL as-is
      return mediaUrl;
    }
    const data = await response.json();
    if (
      data.status === "completed" ||
      data.percent === "Completed" ||
      data.progress === "Completed"
    ) {
      if (data.fileUrl) return data.fileUrl;
      if (data.viewUrl) return data.viewUrl;
    }
    if (data.status === "error" || data.status === "fail") {
      throw new Error(data.message || "Server konversi video melaporkan kesalahan.");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Waktu tunggu konversi lewat batas (Timeout). Silakan coba lagi.");
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
