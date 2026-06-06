import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers":
    "content-length, content-range, accept-ranges, content-type",
};

const getCookie = async (): Promise<string> => {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "ais_cookie")
      .maybeSingle();
    if (data?.value) return data.value as string;
  } catch {}
  return Deno.env.get("AIS_COOKIE") || "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const reqUrl = new URL(req.url);
    const target = reqUrl.searchParams.get("url");
    if (!target) {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const COOKIE = await getCookie();
    const headers: Record<string, string> = {
      Cookie: COOKIE,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
    const range = req.headers.get("range");
    if (range) headers["Range"] = range;

    const upstream = await fetch(target, { headers, redirect: "follow" });

    const respHeaders = new Headers(corsHeaders);
    const passthrough = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "etag",
      "last-modified",
    ];
    for (const k of passthrough) {
      const v = upstream.headers.get(k);
      if (v) respHeaders.set(k, v);
    }
    if (!respHeaders.has("accept-ranges")) {
      respHeaders.set("accept-ranges", "bytes");
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Stream failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
