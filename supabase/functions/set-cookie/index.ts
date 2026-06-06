import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, value } = await req.json();
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "clear") {
      await admin.from("app_config").delete().eq("key", "ais_cookie");
      return json({ ok: true });
    }

    if (action === "save") {
      if (!value || typeof value !== "string") {
        return json({ error: "Missing value" }, 400);
      }
      const trimmed = value.trim();
      if (trimmed.length < 10 || trimmed.length > 24000) {
        return json({ error: "Invalid cookie length" }, 400);
      }
      // Replace old: upsert with new value + updated_at
      const { error } = await admin
        .from("app_config")
        .upsert({ key: "ais_cookie", value: trimmed, updated_at: new Date().toISOString() });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "status") {
      const { data } = await admin
        .from("app_config")
        .select("updated_at, value")
        .eq("key", "ais_cookie")
        .maybeSingle();
      return json({
        exists: !!data,
        updated_at: data?.updated_at || null,
        length: data?.value?.length || 0,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
