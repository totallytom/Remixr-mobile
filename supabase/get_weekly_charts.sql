-- Weekly Sypher Charts
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Ranks tracks by play count in the last 7 days, with total likes as tiebreaker.

CREATE OR REPLACE FUNCTION get_weekly_charts(
  p_limit int DEFAULT 50,
  p_genre text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  artist text,
  album text,
  cover text,
  audio_url text,
  genre text,
  duration int,
  price numeric,
  likes int,
  weekly_plays bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    t.id,
    t.title,
    t.artist,
    t.album,
    t.cover,
    t.audio_url,
    t.genre,
    t.duration,
    t.price,
    COALESCE(t.likes, 0)       AS likes,
    COUNT(ph.id)::bigint        AS weekly_plays
  FROM tracks t
  LEFT JOIN user_play_history ph
    ON  ph.track_id = t.id
    AND ph.played_at > (now() - interval '7 days')
  WHERE p_genre IS NULL OR t.genre = p_genre
  GROUP BY t.id
  HAVING COUNT(ph.id) > 0
  ORDER BY weekly_plays DESC, COALESCE(t.likes, 0) DESC
  LIMIT p_limit;
$$;
