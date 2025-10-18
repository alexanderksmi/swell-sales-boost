-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('org_admin', 'sales_rep');

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role, tenant_id)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view roles in their tenant"
  ON public.user_roles
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Org admins can manage roles in their tenant"
  ON public.user_roles
  FOR ALL
  USING (
    tenant_id = get_user_tenant_id() 
    AND has_role(auth.uid(), 'org_admin')
  );

-- Create table for storing HubSpot tokens securely
CREATE TABLE public.hubspot_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- Enable RLS on hubspot_tokens
ALTER TABLE public.hubspot_tokens ENABLE ROW LEVEL SECURITY;

-- Only org admins can view/manage tokens in their tenant
CREATE POLICY "Org admins can manage tokens in their tenant"
  ON public.hubspot_tokens
  FOR ALL
  USING (
    tenant_id = get_user_tenant_id() 
    AND has_role(auth.uid(), 'org_admin')
  );

-- Add trigger for updated_at on hubspot_tokens
CREATE TRIGGER update_hubspot_tokens_updated_at
  BEFORE UPDATE ON public.hubspot_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_tenant_id ON public.user_roles(tenant_id);
CREATE INDEX idx_hubspot_tokens_tenant_id ON public.hubspot_tokens(tenant_id);