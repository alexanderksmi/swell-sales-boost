-- Add is_active column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Create user_teams junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS public.user_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, team_id)
);

-- Add hubspot_team_id to teams table for tracking HubSpot teams
ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS hubspot_team_id text UNIQUE;

-- Enable RLS on user_teams
ALTER TABLE public.user_teams ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_teams
CREATE POLICY "Users can view user_teams in their tenant"
ON public.user_teams
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = user_teams.user_id
    AND users.tenant_id = get_user_tenant_id()
  )
);

CREATE POLICY "Org admins can manage user_teams in their tenant"
ON public.user_teams
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = user_teams.user_id
    AND users.tenant_id = get_user_tenant_id()
  )
  AND has_role(auth.uid(), 'org_admin'::app_role)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_teams_user_id ON public.user_teams(user_id);
CREATE INDEX IF NOT EXISTS idx_user_teams_team_id ON public.user_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users(is_active);
CREATE INDEX IF NOT EXISTS idx_teams_hubspot_team_id ON public.teams(hubspot_team_id);