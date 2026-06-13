-- Audio Challenges
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- 1. Allow uploaders to opt tracks into challenges
ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS challenges_open boolean NOT NULL DEFAULT false;

-- 2. Challenge responses — stores the clip directly, no tracks row needed
CREATE TABLE IF NOT EXISTS challenge_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_track_id uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  audio_url       text NOT NULL DEFAULT '',
  duration        int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_track_id, user_id)
);

CREATE INDEX IF NOT EXISTS challenge_responses_source_idx
  ON challenge_responses (source_track_id, created_at DESC);

CREATE INDEX IF NOT EXISTS challenge_responses_user_idx
  ON challenge_responses (user_id, created_at DESC);

-- Row-level security
ALTER TABLE challenge_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challenge_responses_select"
  ON challenge_responses FOR SELECT
  USING (true);

CREATE POLICY "challenge_responses_insert"
  ON challenge_responses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "challenge_responses_delete"
  ON challenge_responses FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
