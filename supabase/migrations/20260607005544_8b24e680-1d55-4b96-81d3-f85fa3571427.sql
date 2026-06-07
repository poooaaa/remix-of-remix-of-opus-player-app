
CREATE TABLE public.cached_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url text UNIQUE NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cached_videos TO anon, authenticated;
GRANT ALL ON public.cached_videos TO service_role;
ALTER TABLE public.cached_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read cached videos" ON public.cached_videos FOR SELECT USING (true);

CREATE POLICY "public read yt-videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'yt-videos');
