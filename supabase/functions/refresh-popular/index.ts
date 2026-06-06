import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch popular songs from Apple Music RSS
    const res = await fetch(
      "https://rss.applemarketingtools.com/api/v2/id/music/most-played/25/songs.json",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
      }
    );
    const rssData = await res.json();
    const results = rssData?.feed?.results;
    if (!results || !Array.isArray(results)) {
      return new Response(JSON.stringify({ error: "No results from RSS" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch duration for each song from iTunes
    const songs = await Promise.all(
      results.map(async (item: any, index: number) => {
        let durationMs = 0;
        try {
          const searchRes = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(item.artistName + " " + item.name)}&entity=song&limit=1`
          );
          const searchData = await searchRes.json();
          if (searchData?.results?.[0]?.trackTimeMillis) {
            durationMs = searchData.results[0].trackTimeMillis;
          }
        } catch {}

        return {
          title: `${item.artistName} - ${item.name}`,
          artist: item.artistName || "",
          thumbnail: item.artworkUrl100?.replace("100x100bb", "600x600bb") || "",
          track_url: item.url || "",
          duration_ms: durationMs,
          source: "applemusic",
          position: index,
        };
      })
    );

    // Delete old songs and insert new ones
    await supabase.from("popular_songs").delete().gte("position", 0);
    const { error: insertError } = await supabase.from("popular_songs").insert(songs);
    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, count: songs.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Refresh popular error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to refresh" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
