import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GROQ_KEY = Deno.env.get("GROQ_API_KEY") || "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";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    if (!query?.trim()) {
      return new Response(JSON.stringify({ result: query, changed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `Kamu adalah asisten pencarian musik. Tugasmu adalah menentukan apakah input user adalah:
1. Judul lagu yang spesifik (contoh: "Sial", "Risalah Hati", "Night Changes") → JANGAN ubah, kembalikan apa adanya
2. Deskripsi/permintaan lagu (contoh: "lagu santai", "lagu galau malam", "lagu semangat kerja") → Ubah menjadi SATU judul lagu yang cocok

JAWAB HANYA dengan format JSON: {"title": "judul", "changed": true/false}
- changed: false jika input sudah berupa judul lagu
- changed: true jika kamu mengubah deskripsi menjadi judul lagu
Jangan tambahkan penjelasan apapun.`
          },
          { role: "user", content: query }
        ],
        max_tokens: 50,
        temperature: 0.3,
      }),
    });

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";

    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return new Response(JSON.stringify({
          result: parsed.title || query,
          changed: !!parsed.changed,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch {}

    return new Response(JSON.stringify({ result: query, changed: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Smart search error:", error);
    return new Response(JSON.stringify({ result: "", changed: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
