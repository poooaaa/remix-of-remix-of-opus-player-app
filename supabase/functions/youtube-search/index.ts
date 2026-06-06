import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore npm module
import youtubesearchapi from "npm:youtube-search-api@1.2.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "Missing query", items: [] }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parseDurationSeconds = (value: string | undefined) => {
      if (!value) return null;
      const parts = value.split(":").map((part) => Number(part));
      if (parts.some((part) => !Number.isFinite(part))) return null;
      return parts.reduce((total, part) => total * 60 + part, 0);
    };

    const result = await youtubesearchapi.GetListByKeyword(query, false, 20);
    const items = (result?.items || [])
      .filter((i: any) => i.type === "video" && i.id)
      .map((i: any) => ({
        id: i.id,
        title: i.title || "",
        thumbnail: i.thumbnail?.thumbnails?.[i.thumbnail.thumbnails.length - 1]?.url || "",
        duration: i.length?.simpleText || "",
        duration_seconds: parseDurationSeconds(i.length?.simpleText),
        channel: i.channelTitle || "",
      }));

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("youtube-search error:", e);
    return new Response(JSON.stringify({ error: String(e), items: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
