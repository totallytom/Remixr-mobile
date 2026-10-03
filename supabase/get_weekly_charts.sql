-- Weekly Sypher Charts
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Ranks published tracks by play count in the last 7 days, with total likes as
-- tiebreaker.
--
-- Same definition as the website's copyright migration (sypher repo,
-- 20260926012752_published_track_filters.sql) minus the retired embed columns;
-- remove_embed_columns.sql recreates it identically. Keep all three in sync.
-- CREATE OR REPLACE can't change a function's RETURNS TABLE, hence the DROP.
-- title/artist/album/cover/genre are varchar(255) on the live table, so every
-- text column is cast explicitly (RETURNS TABLE needs an exact type match).

DROP FUNCTION IF EXISTS public.get_weekly_charts(integer, text);
CREATE FUNCTION public.get_weekly_charts(
  p_limit int DEFAULT 50,
  p_genre text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, title text, artist text, album text, cover text, audio_url text,
  genre text, duration int, price numeric, likes int, weekly_plays bigint
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT
    t.id, t.title::text, t.artist::text, t.album::text, t.cover::text,
    t.audio_url::text, t.genre::text, t.duration, t.price,
    COALESCE(t.likes, 0) AS likes,
    COUNT(ph.id)::bigint AS weekly_plays
  FROM tracks t
  LEFT JOIN user_play_history ph
    ON  ph.track_id = t.id
    AND ph.played_at > (now() - interval '7 days')
  WHERE t.status = 'published'
    AND (p_genre IS NULL OR t.genre = p_genre)
  GROUP BY t.id
  HAVING COUNT(ph.id) > 0
  ORDER BY weekly_plays DESC, COALESCE(t.likes, 0) DESC
  LIMIT p_limit;
$$;
