CREATE TABLE IF NOT EXISTS public.video_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  preview_url TEXT,
  storage_path TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_jobs TO authenticated;
GRANT SELECT ON public.video_jobs TO anon;
GRANT ALL ON public.video_jobs TO service_role;
ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "video_jobs readable to all" ON public.video_jobs FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS video_jobs_url_idx ON public.video_jobs(video_url);
CREATE INDEX IF NOT EXISTS video_jobs_status_idx ON public.video_jobs(status);