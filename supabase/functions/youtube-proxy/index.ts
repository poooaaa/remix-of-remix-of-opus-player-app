import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, query, url } = await req.json();

    if (action === "search") {
      if (!query || typeof query !== "string") {
        return new Response(JSON.stringify({ error: "Missing query" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(`https://dycoderss.xyz/api/yts?query=${encodeURIComponent(query)}`);
      const data = await res.json();

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get-video") {
      if (!url || typeof url !== "string") {
        return new Response(JSON.stringify({ error: "Missing url" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 1: Get download links via ytdl-v4
      const ytdlRes = await fetch(
        `https://api.harzrestapi.web.id/api/ytdl-v4?url=${encodeURIComponent(url)}`
      );
      const ytdlData = await ytdlRes.json();

      if (!ytdlData?.success || !ytdlData?.media) {
        return new Response(JSON.stringify({ error: "Failed to get video data" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find smallest SD MP4 for fastest processing
      const videos = ytdlData.media.filter((m: any) => m.type === "Video" && m.extension === "MP4");
      const preferred = videos.find((v: any) => v.quality === "SD")
        || videos[0];

      if (!preferred?.downloadUrl) {
        return new Response(JSON.stringify({ error: "No video URL found" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 2: Poll the download URL until status is "completed"
      let viewUrl: string | null = null;
      for (let i = 0; i < 15; i++) {
        const dlRes = await fetch(preferred.downloadUrl);
        const dlData = await dlRes.json();
        if (dlData?.status === "completed" && dlData?.viewUrl) {
          viewUrl = dlData.viewUrl;
          break;
        }
        if (dlData?.status === "error") break;
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!viewUrl) {
        return new Response(JSON.stringify({ error: "Failed to get stream URL" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ videoUrl: viewUrl }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Request failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
