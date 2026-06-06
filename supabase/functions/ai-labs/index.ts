import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const GROQ_KEY = Deno.env.get("GROQ_API_KEY") || "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";

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getItunesMetadata(title: string, artist: string) {
  try {
    const res = await fetchWithTimeout(
      `https://itunes.apple.com/search?term=${encodeURIComponent(title + " " + artist)}&media=music&limit=1`
    );
    const data = await res.json();
    if (data?.results?.length > 0) {
      const track = data.results[0];
      let releaseDate = "tanggal yang tidak diketahui";
      if (track.releaseDate) {
        const d = new Date(track.releaseDate);
        releaseDate = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
      }
      return {
        song: track.trackName || title,
        artist: track.artistName || artist,
        genre: track.primaryGenreName || "Pop",
        releaseDate,
        artistId: track.artistId || null,
      };
    }
  } catch (e) {
    console.error("iTunes error:", e);
  }
  return { song: title, artist, genre: "Pop", releaseDate: "tanggal yang tidak diketahui", artistId: null };
}

async function fetchLyrics(title: string, artist: string): Promise<string | null> {
  const queries = [`${title} ${artist}`.trim(), title];
  for (const q of queries) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetchWithTimeout(
          `https://opus-dev-v1.vercel.app/api/v1/search/lyric?q=${encodeURIComponent(q)}`,
          {}, 10000
        );
        const data = await res.json();
        const result = Array.isArray(data) ? data[0] : data;
        const lyric = result?.lirik || result?.lyrics;
        if (lyric && String(lyric).length > 30) {
          return String(lyric).replace(/\\n/g, "\n");
        }
      } catch (e) {
        console.error(`Lyrics attempt ${attempt + 1} for "${q}" error:`, e);
      }
    }
  }
  return null;
}

async function summarizeMeaning(lyrics: string, title: string, artist: string): Promise<string> {
  const fallback = "dinamika kehidupan modern dan perasaan personal yang disampaikan secara puitis oleh sang penyanyi ke dalam liriknya";
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content: `Kamu adalah pengamat musik profesional yang jujur, objektif, dan blak-blakan. Tugas kamu menjelaskan judul lagu dan makna liriknya. Jawab dalam bahasa Indonesia. ATURAN KETAT:
1. Mulai dengan SATU kalimat singkat yang menjelaskan secara objektif makna atau referensi dari JUDUL lagu (apa yang dimaksud judulnya, dari mana asalnya, atau apa yang disimbolkannya). Awali dengan "Judulnya merujuk pada..." atau "Judul ini menggambarkan..."
2. Setelah itu lanjutkan dengan 2 kalimat tentang inti cerita lirik. Awali bagian ini dengan "Lagu ini menceritakan tentang..." — JANGAN PERNAH gunakan "Lirik ini menceritakan", "Lirik ini menggambarkan", atau frase apa pun yang dimulai dengan "Lirik ini"
3. JANGAN menyensor atau menghaluskan makna lagu. Jelaskan APA ADANYA termasuk tema gelap seperti kematian, keputusasaan, bunuh diri, kekerasan, seks, narkoba, dll. Kamu BUKAN sensor, kamu pengamat musik
4. JANGAN menambahkan peringatan, disclaimer, atau catatan moral
5. PENTING: Subjek lagu TIDAK selalu manusia. Bisa tentang benda, hewan, alam, konsep abstrak, tempat, atau peristiwa. Identifikasi subjek sebenarnya dari lirik dan jelaskan dengan tepat
6. Tetap objektif — jelaskan apa yang ada, bukan opini pribadi
7. Total maksimal 3 kalimat`
            },
            {
              role: "user",
              content: `Lirik lagu "${title}" oleh ${artist}:\n\n${lyrics.slice(0, 2000)}`
            }
          ],
          max_tokens: 400,
          temperature: 0.5,
        }),
      }, 15000);

      const data = await res.json();
      let text = data?.choices?.[0]?.message?.content?.trim();
      if (text && text.length > 10) {
        text = text.charAt(0).toUpperCase() + text.slice(1);
        return text;
      }
    } catch (e) {
      console.error(`Groq attempt ${attempt + 1} error:`, e);
    }
  }
  return fallback;
}

async function searchArtistPhoto(artistName: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=1`
    );
    const data = await res.json();
    return data?.data?.[0]?.picture_xl || data?.data?.[0]?.picture_big || null;
  } catch (e) {
    console.error("Deezer error:", e);
    return null;
  }
}

async function getArtistTopSongs(artistId: number | null, artistName: string): Promise<any[]> {
  try {
    if (artistId) {
      const res = await fetchWithTimeout(
        `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=10`
      );
      const data = await res.json();
      if (data?.results?.length > 1) {
        // First result is the artist, rest are songs
        return data.results.slice(1).map((t: any) => ({
          title: t.trackName,
          artist: t.artistName,
          thumbnail: t.artworkUrl100?.replace("100x100bb", "300x300bb") || "",
          trackUrl: t.trackViewUrl || "",
        }));
      }
    }
    // Fallback: search by artist name
    const res = await fetchWithTimeout(
      `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=10`
    );
    const data = await res.json();
    if (data?.results?.length > 0) {
      return data.results.map((t: any) => ({
        title: t.trackName,
        artist: t.artistName,
        thumbnail: t.artworkUrl100?.replace("100x100bb", "300x300bb") || "",
        trackUrl: t.trackViewUrl || "",
      }));
    }
  } catch (e) {
    console.error("Artist songs error:", e);
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, artist } = await req.json();
    if (!title) {
      return new Response(JSON.stringify({ error: "Missing title" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [itunesData, artistPhoto, lyrics] = await Promise.all([
      getItunesMetadata(title, artist || ""),
      searchArtistPhoto(artist || title),
      fetchLyrics(title, artist || ""),
    ]);

    let meaning: string;
    if (lyrics) {
      meaning = await summarizeMeaning(lyrics, title, artist || "");
    } else {
      meaning = "dinamika kehidupan modern dan perasaan personal yang disampaikan secara puitis oleh sang penyanyi ke dalam liriknya";
    }

    // Get artist's other songs
    const artistSongs = await getArtistTopSongs(itunesData.artistId, itunesData.artist);

    // Build summary — `meaning` now contains title explanation + story
    const summary = `Lagu "${itunesData.song}" diciptakan oleh ${itunesData.artist} dan dirilis pada ${itunesData.releaseDate} dengan genre ${itunesData.genre}. ${meaning}`;

    return new Response(JSON.stringify({ summary, artistImage: artistPhoto, artistName: itunesData.artist, artistSongs }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("AI Labs error:", error);
    return new Response(JSON.stringify({ error: error.message || "Failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
