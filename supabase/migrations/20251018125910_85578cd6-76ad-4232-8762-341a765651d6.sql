-- Create tenants table
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_portal_id TEXT UNIQUE,
  company_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create users table (profiles)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  hubspot_user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(tenant_id, email)
);

-- Create teams table
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create leaderboard_categories table
CREATE TABLE public.leaderboard_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create scoring_rule_sets table
CREATE TABLE public.scoring_rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.leaderboard_categories(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  hubspot_property TEXT NOT NULL,
  points_per_unit INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create points_ledger table
CREATE TABLE public.points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.leaderboard_categories(id) ON DELETE CASCADE NOT NULL,
  rule_set_id UUID REFERENCES public.scoring_rule_sets(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  source TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create org_defaults table
CREATE TABLE public.org_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(tenant_id, setting_key)
);

-- Create user_overrides table
CREATE TABLE public.user_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(tenant_id, user_id, setting_key)
);

-- Enable Row Level Security on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_rule_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_overrides ENABLE ROW LEVEL SECURITY;

-- Create function to get current user's tenant_id
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid()
$$;

-- RLS Policies for tenants table
CREATE POLICY "Users can view their own tenant"
  ON public.tenants FOR SELECT
  USING (id = public.get_user_tenant_id());

-- RLS Policies for users table
CREATE POLICY "Users can view users in their tenant"
  ON public.users FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE
  USING (id = auth.uid());

-- RLS Policies for teams table
CREATE POLICY "Users can view teams in their tenant"
  ON public.teams FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can manage teams in their tenant"
  ON public.teams FOR ALL
  USING (tenant_id = public.get_user_tenant_id());

-- RLS Policies for leaderboard_categories table
CREATE POLICY "Users can view categories in their tenant"
  ON public.leaderboard_categories FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can manage categories in their tenant"
  ON public.leaderboard_categories FOR ALL
  USING (tenant_id = public.get_user_tenant_id());

-- RLS Policies for scoring_rule_sets table
CREATE POLICY "Users can view rule sets in their tenant"
  ON public.scoring_rule_sets FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can manage rule sets in their tenant"
  ON public.scoring_rule_sets FOR ALL
  USING (tenant_id = public.get_user_tenant_id());

-- RLS Policies for points_ledger table
CREATE POLICY "Users can view points in their tenant"
  ON public.points_ledger FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert points in their tenant"
  ON public.points_ledger FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- RLS Policies for org_defaults table
CREATE POLICY "Users can view org defaults in their tenant"
  ON public.org_defaults FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can manage org defaults in their tenant"
  ON public.org_defaults FOR ALL
  USING (tenant_id = public.get_user_tenant_id());

-- RLS Policies for user_overrides table
CREATE POLICY "Users can view overrides in their tenant"
  ON public.user_overrides FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can manage their own overrides"
  ON public.user_overrides FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND user_id = auth.uid());

-- Create indexes for better performance
CREATE INDEX idx_users_tenant_id ON public.users(tenant_id);
CREATE INDEX idx_teams_tenant_id ON public.teams(tenant_id);
CREATE INDEX idx_leaderboard_categories_tenant_id ON public.leaderboard_categories(tenant_id);
CREATE INDEX idx_scoring_rule_sets_tenant_id ON public.scoring_rule_sets(tenant_id);
CREATE INDEX idx_points_ledger_tenant_id ON public.points_ledger(tenant_id);
CREATE INDEX idx_points_ledger_user_id ON public.points_ledger(user_id);
CREATE INDEX idx_org_defaults_tenant_id ON public.org_defaults(tenant_id);
CREATE INDEX idx_user_overrides_tenant_id ON public.user_overrides(tenant_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leaderboard_categories_updated_at BEFORE UPDATE ON public.leaderboard_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_scoring_rule_sets_updated_at BEFORE UPDATE ON public.scoring_rule_sets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_org_defaults_updated_at BEFORE UPDATE ON public.org_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_overrides_updated_at BEFORE UPDATE ON public.user_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();