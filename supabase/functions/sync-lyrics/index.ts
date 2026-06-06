import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GROQ_KEY = Deno.env.get("GROQ_API_KEY");

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const toTokenSet = (text: string) => {
  const normalized = normalizeText(text);
  return new Set(normalized.split(" ").filter((token) => token.length > 1));
};

const similarityScore = (a: string, b: string) => {
  const aTokens = toTokenSet(a);
  const bTokens = toTokenSet(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(1, Math.min(aTokens.size, bTokens.size));
};

const coerceMatchIndex = (value: unknown, max: number) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n >= max) return null;
  return n;
};

const buildHeuristicMatches = (opusLines: string[], lrclib: Array<{ t: number; text: string }>) => {
  const matches: Array<number | null> = [];
  let cursor = 0;

  for (let i = 0; i < opusLines.length; i++) {
    const remainingOpus = opusLines.length - i - 1;
    const maxIndex = Math.max(cursor, lrclib.length - remainingOpus - 1);
    let bestIdx: number | null = null;
    let bestScore = 0;

    for (let j = cursor; j <= maxIndex && j < lrclib.length; j++) {
      const base = similarityScore(opusLines[i], lrclib[j]?.text || "");
      const exactBonus = normalizeText(opusLines[i]) === normalizeText(lrclib[j]?.text || "") ? 1 : 0;
      const score = base + exactBonus;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = j;
      }
    }

    if (bestIdx != null && bestScore >= 0.22) {
      matches.push(bestIdx);
      cursor = bestIdx + 1;
    } else {
      matches.push(null);
    }
  }

  return matches;
};

const buildTimingsFromMatches = (opusLines: string[], lrclib: Array<{ t: number; text: string }>, rawMatches: unknown[]) => {
  const matches = rawMatches.slice(0, opusLines.length).map((value) => coerceMatchIndex(value, lrclib.length));

  for (let i = 0; i < matches.length; i++) {
    const idx = matches[i];
    if (idx == null || idx === 0) continue;

    const currentScore = similarityScore(opusLines[i], lrclib[idx]?.text || "");
    const previousScore = similarityScore(opusLines[i], lrclib[idx - 1]?.text || "");
    const prevChosen = i > 0 ? matches[i - 1] : null;

    if (previousScore > currentScore + 0.12 && (prevChosen == null || idx - 1 >= prevChosen)) {
      matches[i] = idx - 1;
    }
  }

  const timings = Array.from({ length: opusLines.length }, () => Number.NaN);
  for (let i = 0; i < matches.length; i++) {
    const idx = matches[i];
    if (idx != null) timings[i] = Number(lrclib[idx]?.t ?? Number.NaN);
  }

  for (let i = 0; i < timings.length; i++) {
    if (Number.isFinite(timings[i])) continue;

    let prev = i - 1;
    while (prev >= 0 && !Number.isFinite(timings[prev])) prev -= 1;

    let next = i + 1;
    while (next < timings.length && !Number.isFinite(timings[next])) next += 1;

    if (prev >= 0 && next < timings.length) {
      const step = (timings[next] - timings[prev]) / (next - prev);
      timings[i] = timings[prev] + step * (i - prev);
    } else if (prev >= 0) {
      timings[i] = timings[prev] + 2;
    } else if (next < timings.length) {
      timings[i] = Math.max(0, timings[next] - 2 * (next - i));
    } else {
      timings[i] = i * 2;
    }
  }

  return timings;
};

// Map opus lyric lines to LRCLIB timestamps using Groq.
// Input:
//   opusLines: string[]  (non-blank opus lyric lines, ordered)
//   lrclib: { t: number, text: string }[]  (timestamped LRCLIB lines)
// Output: { timings: number[] } - length === opusLines.length
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { opusLines, lrclib } = await req.json();
    if (!Array.isArray(opusLines) || !Array.isArray(lrclib)) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const opusText = opusLines.map((l: string, i: number) => `${i}: ${l}`).join("\n");
    const lrclibText = lrclib
      .map((x: any, i: number) => `${i} [${Number(x.t).toFixed(2)}s] ${x.text}`)
      .join("\n");

    const prompt = `You will align song lyrics with timestamps.

OPUS LYRICS (target, ordered by index):
${opusText}

LRCLIB LYRICS WITH TIMESTAMPS:
${lrclibText}

For EACH opus line index (0..${opusLines.length - 1}) return the LRCLIB line index where that lyric STARTS, never the next line. If an opus line has no clear match, return null instead of guessing the following line.

Return ONLY a JSON object: {"matches":[m0,m1,...]} with exactly ${opusLines.length} items. Each item must be an integer LRCLIB index or null. No prose.`;

    let parsed: any = {};

    if (GROQ_KEY) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GROQ_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: "You output only valid JSON. No commentary." },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 4000,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const raw = data?.choices?.[0]?.message?.content || "{}";
          try { parsed = JSON.parse(raw); } catch {}
        }
      } catch (groqError) {
        console.error("sync-lyrics groq fallback:", groqError);
      }
    }

    let timings: number[] = [];

    if (Array.isArray(parsed.matches) && parsed.matches.length === opusLines.length) {
      timings = buildTimingsFromMatches(opusLines, lrclib, parsed.matches);
    } else if (Array.isArray(parsed.timings)) {
      timings = parsed.timings.map((n: any) => Number(n)).filter((n: any) => Number.isFinite(n));
    } else {
      timings = buildTimingsFromMatches(opusLines, lrclib, buildHeuristicMatches(opusLines, lrclib));
    }

    // Validate length; if mismatched, fall back to proportional interpolation.
    if (timings.length !== opusLines.length) {
      const first = lrclib[0]?.t ?? 0;
      const last = lrclib[lrclib.length - 1]?.t ?? first + opusLines.length;
      const step = (last - first) / Math.max(1, opusLines.length - 1);
      timings = opusLines.map((_: any, i: number) => first + step * i);
    }

    // Ensure strictly increasing
    for (let i = 1; i < timings.length; i++) {
      if (timings[i] <= timings[i - 1]) timings[i] = timings[i - 1] + 0.1;
    }

    return new Response(JSON.stringify({ timings }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sync-lyrics error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message || "Failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
