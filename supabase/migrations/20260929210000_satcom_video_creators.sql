-- Optional creator allowlist and SMS opt-out registry for SATCOM Video Desk.
-- Apply manually. Do not store creator or reviewer phone numbers in git.

CREATE TABLE IF NOT EXISTS satcom_video.creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL UNIQUE,
  slug text NOT NULL,
  display_name text NOT NULL,
  opted_in boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creators_phone_e164_format CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT creators_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE IF NOT EXISTS satcom_video.sms_opt_outs (
  phone_e164 text PRIMARY KEY,
  opted_out boolean NOT NULL DEFAULT true,
  source text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_opt_outs_phone_e164_format CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

GRANT ALL ON TABLE satcom_video.creators TO service_role;
GRANT ALL ON TABLE satcom_video.sms_opt_outs TO service_role;
ALTER TABLE satcom_video.creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE satcom_video.sms_opt_outs ENABLE ROW LEVEL SECURITY;
