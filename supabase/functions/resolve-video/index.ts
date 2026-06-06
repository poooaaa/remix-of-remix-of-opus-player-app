import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ENDPOINT =
  "https://ais-dev-qimxzhm73p7g3jbtuahe7c-469752920153.asia-east1.run.app/api/resolve";

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return json({ error: "Missing url" }, 400);
    }
    const COOKIE = await getCookie();
    if (!COOKIE) {
      return json(
        { error: "AIS_COOKIE not configured", code: "COOKIE_MISSING" },
        500,
      );
    }

    const res = await fetch(`${ENDPOINT}?url=${encodeURIComponent(url)}`, {
      headers: {
        Cookie: COOKIE,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      redirect: "manual",
    });

    // Redirect = cookie tidak valid (di-redirect ke login Google)
    if (res.status >= 300 && res.status < 400) {
      return json(
        {
          error:
            "AIS_COOKIE kadaluwarsa atau tidak valid. Silakan perbarui cookie dari Google AI Studio.",
          code: "COOKIE_EXPIRED",
        },
        401,
      );
    }

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();

    if (!contentType.includes("application/json")) {
      const looksLikeHtml = text.trim().startsWith("<");
      return json(
        {
          error: looksLikeHtml
            ? "AIS_COOKIE kadaluwarsa atau tidak valid. Silakan perbarui cookie dari Google AI Studio."
            : "Resolver mengembalikan response non-JSON",
          code: looksLikeHtml ? "COOKIE_EXPIRED" : "INVALID_RESPONSE",
          status: res.status,
        },
        looksLikeHtml ? 401 : 502,
      );
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return json(
        { error: "Invalid JSON from resolver", raw: text.slice(0, 200) },
        502,
      );
    }

    if (!res.ok) {
      return json({ error: data?.error || "Resolver error", data }, res.status);
    }

    let previewUrl: string | undefined = data?.preview_url || data?.url;
    if (previewUrl && previewUrl.startsWith("http://")) {
      previewUrl = "https://" + previewUrl.slice("http://".length);
    }
    if (!previewUrl) {
      return json({ error: "No preview_url in response", data }, 502);
    }

    // Wrap with stream-video proxy so the browser doesn't need the AIS auth cookie
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const proxiedUrl = `${supabaseUrl}/functions/v1/stream-video?url=${encodeURIComponent(previewUrl)}`;

    return json({
      previewUrl: proxiedUrl,
      title: data?.title,
      thumbnail: data?.thumbnail,
      resolution: data?.resolution,
    });

  } catch (error) {
    return json({ error: (error as Error).message || "Request failed" }, 500);
  }
});
