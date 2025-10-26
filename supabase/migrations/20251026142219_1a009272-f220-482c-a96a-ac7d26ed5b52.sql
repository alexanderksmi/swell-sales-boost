-- Create table for OAuth state validation
CREATE TABLE IF NOT EXISTS public.oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_value text NOT NULL UNIQUE,
  client_state text NOT NULL,
  frontend_url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '10 minutes'),
  used boolean NOT NULL DEFAULT false
);

-- Enable RLS
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- Policy: Allow inserting new states
CREATE POLICY "Anyone can insert oauth states"
  ON public.oauth_states
  FOR INSERT
  WITH CHECK (true);

-- Policy: Allow reading valid states (not expired, not used)
CREATE POLICY "Anyone can read valid oauth states"
  ON public.oauth_states
  FOR SELECT
  USING (expires_at > now() AND used = false);

-- Policy: Allow updating used flag
CREATE POLICY "Anyone can mark oauth states as used"
  ON public.oauth_states
  FOR UPDATE
  USING (expires_at > now())
  WITH CHECK (true);

-- Policy: Allow deleting expired states
CREATE POLICY "Anyone can delete expired oauth states"
  ON public.oauth_states
  FOR DELETE
  USING (expires_at < now() OR used = true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_oauth_states_value ON public.oauth_states(state_value);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON public.oauth_states(expires_at);