import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "yt-videos";
const MAX_CACHED = 3;
const QUALITIES = ["720p", "480p", "360p", "144p"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeUrl = (url: string): string => {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return "https://www.youtube.com/watch?v=" + u.pathname.slice(1);
    }
    const v = u.searchParams.get("v");
    if (v) return "https://www.youtube.com/watch?v=" + v;
    return url;
  } catch {
    return url;
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const startDownload = async (url: string, quality: string) => {
  const res = await fetch("https://ytdl.y2mp3.co/api/v2/download", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      url,
      output: { type: "video", format: "mp4", quality },
    }),
  });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const pollStatus = async (statusUrl: string) => {
  const id = statusUrl.split("/").pop();
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`https://ytdl.y2mp3.co/api/status/${id}`, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.status === "completed") return data;
      if (data?.status === "failed") return null;
    }
    await sleep(3000);
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") return json({ error: "Missing url" }, 400);
    const normalized = normalizeUrl(url);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1. Check cache
    const { data: cached } = await admin
      .from("cached_videos")
      .select("storage_path")
      .eq("video_url", normalized)
      .maybeSingle();

    if (cached?.storage_path) {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${cached.storage_path}`;
      return json({ previewUrl: publicUrl, cached: true });
    }

    // 2. Try qualities in order
    let downloadUrl: string | null = null;
    for (const q of QUALITIES) {
      const start = await startDownload(normalized, q);
      if (!start?.statusUrl) continue;
      const result = await pollStatus(start.statusUrl);
      if (result?.downloadUrl) {
        downloadUrl = result.downloadUrl;
        break;
      }
    }
    if (!downloadUrl) return json({ error: "Failed to resolve any quality" }, 502);

    // 3. Fetch the file
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) return json({ error: "Failed to download file" }, 502);
    const blob = await fileRes.arrayBuffer();

    // 4. Upload to storage
    const vid = normalized.split("v=")[1]?.slice(0, 20) || crypto.randomUUID();
    const storagePath = `${vid}-${Date.now()}.mp4`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, new Uint8Array(blob), {
        contentType: "video/mp4",
        upsert: true,
      });
    if (upErr) return json({ error: "Upload failed: " + upErr.message }, 500);

    // 5. Insert cache row
    await admin.from("cached_videos").insert({
      video_url: normalized,
      storage_path: storagePath,
    });

    // 6. Enforce MAX_CACHED — delete oldest beyond limit
    const { data: all } = await admin
      .from("cached_videos")
      .select("id, storage_path, created_at")
      .order("created_at", { ascending: false });

    if (all && all.length > MAX_CACHED) {
      const toDelete = all.slice(MAX_CACHED);
      const paths = toDelete.map((r) => r.storage_path);
      const ids = toDelete.map((r) => r.id);
      await admin.storage.from(BUCKET).remove(paths);
      await admin.from("cached_videos").delete().in("id", ids);
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`;
    return json({ previewUrl: publicUrl, cached: false });
  } catch (error) {
    return json({ error: (error as Error).message || "Request failed" }, 500);
  }
});
