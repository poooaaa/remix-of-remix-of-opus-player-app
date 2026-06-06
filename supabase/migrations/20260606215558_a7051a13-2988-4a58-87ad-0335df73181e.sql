CREATE TABLE IF NOT EXISTS public.popular_songs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  thumbnail TEXT,
  track_url TEXT,
  duration_ms INTEGER DEFAULT 0,
  source TEXT DEFAULT 'applemusic',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT ON public.popular_songs TO anon;
GRANT SELECT ON public.popular_songs TO authenticated;
GRANT ALL ON public.popular_songs TO service_role;
ALTER TABLE public.popular_songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read popular songs" ON public.popular_songs FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_config TO authenticated, anon;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read app_config" ON public.app_config FOR SELECT TO anon, authenticated USING (true);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-popular-midnight');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'refresh-popular-midnight',
  '0 17 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ufpimgcvxlcxhlgxmgwy.supabase.co/functions/v1/refresh-popular',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);