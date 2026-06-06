DELETE FROM public.popular_songs;
ALTER TABLE public.popular_songs ADD CONSTRAINT popular_songs_position_unique UNIQUE (position);