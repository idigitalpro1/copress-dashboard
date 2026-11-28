-- SATCOM video review schema.
-- Apply manually to the chosen Supabase project. Do not store reviewer
-- phone numbers or other personal data in this repository.

CREATE SCHEMA IF NOT EXISTS satcom_video;

CREATE TABLE satcom_video.reviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL UNIQUE,
  display_name text,
  opted_in boolean NOT NULL DEFAULT false,
  opted_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviewers_phone_e164_format CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE TABLE satcom_video.videos (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  creator text NOT NULL,
  credit text NOT NULL,
  publications text[] NOT NULL,
  towns text[] NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('submitted', 'pending_review', 'published', 'rejected')),
  short_code text NOT NULL,
  kind text NOT NULL DEFAULT 'recorded' CHECK (kind IN ('recorded', 'live')),
  poster_url text,
  playback jsonb NOT NULL,
  captions jsonb NOT NULL DEFAULT '[]',
  published_at timestamptz,
  live_confirmed_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  review_requested_at timestamptz,
  decided_at timestamptz,
  decider_id uuid REFERENCES satcom_video.reviewers(id),
  decision_reason text,
  decision_source text CHECK (decision_source IN ('sms', 'dashboard')),
  code_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT videos_id_slug CHECK (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT videos_short_code_format CHECK (short_code ~ '^[A-Z0-9]{4}$')
);

CREATE INDEX satcom_video_videos_status_idx ON satcom_video.videos (status);
CREATE INDEX satcom_video_videos_short_code_idx ON satcom_video.videos (short_code);
CREATE UNIQUE INDEX satcom_video_videos_active_code_idx
  ON satcom_video.videos (short_code)
  WHERE status IN ('submitted', 'pending_review');

CREATE TABLE satcom_video.magic_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid NOT NULL REFERENCES satcom_video.reviewers(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX satcom_video_magic_links_reviewer_idx ON satcom_video.magic_links (reviewer_id);

CREATE TABLE satcom_video.sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_message_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_phone text,
  to_phone text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_message_id)
);

CREATE TABLE satcom_video.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL,
  actor_id text,
  action text NOT NULL,
  video_id text,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX satcom_video_audit_log_created_idx ON satcom_video.audit_log (created_at DESC);

REVOKE ALL ON SCHEMA satcom_video FROM PUBLIC;
GRANT USAGE ON SCHEMA satcom_video TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA satcom_video TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA satcom_video TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA satcom_video GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA satcom_video GRANT ALL ON SEQUENCES TO service_role;

ALTER TABLE satcom_video.reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE satcom_video.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE satcom_video.magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE satcom_video.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE satcom_video.audit_log ENABLE ROW LEVEL SECURITY;
