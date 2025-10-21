-- Create auth_sessions table for secure token exchange
CREATE TABLE public.auth_sessions (
  session_key TEXT PRIMARY KEY,
  session_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes'
);

-- Index for efficient cleanup of expired sessions
CREATE INDEX idx_auth_sessions_expires ON public.auth_sessions(expires_at);

-- RLS: Make table publicly accessible (tokens are one-time use and expire quickly)
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read auth sessions"
ON public.auth_sessions
FOR SELECT
USING (expires_at > NOW());

CREATE POLICY "Anyone can insert auth sessions"
ON public.auth_sessions
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can delete auth sessions"
ON public.auth_sessions
FOR DELETE
USING (true);