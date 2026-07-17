import { createClient } from "jsr:@supabase/supabase-js@2";

const FALLBACK = Deno.env.get("GROQ_API_KEY") || "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";
let cached: { key: string; at: number } | null = null;
const TTL_MS = 30_000;

export async function getGroqKey(): Promise<string> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.key;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "groq_key")
      .maybeSingle();
    const key = (data?.value || "").trim() || FALLBACK;
    cached = { key, at: Date.now() };
    return key;
  } catch {
    return FALLBACK;
  }
}