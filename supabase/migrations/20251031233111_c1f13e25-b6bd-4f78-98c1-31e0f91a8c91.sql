-- Create contacts table
CREATE TABLE public.contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hubspot_contact_id text NOT NULL,
  email text,
  firstname text,
  lastname text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, hubspot_contact_id)
);

-- Enable RLS on contacts
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- RLS policies for contacts
CREATE POLICY "Users can view contacts in their tenant"
  ON public.contacts FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Service role can manage all contacts"
  ON public.contacts FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create deals table
CREATE TABLE public.deals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hubspot_deal_id text NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  hubspot_owner_id text,
  dealname text,
  amount numeric,
  pipeline text,
  dealstage text,
  hs_is_closed boolean DEFAULT false,
  closedate timestamp with time zone,
  hs_lastmodifieddate timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, hubspot_deal_id)
);

-- Enable RLS on deals
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

-- RLS policies for deals
CREATE POLICY "Users can view deals in their tenant"
  ON public.deals FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Service role can manage all deals"
  ON public.deals FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_deals_tenant_owner ON public.deals(tenant_id, owner_id);
CREATE INDEX idx_deals_tenant_stage ON public.deals(tenant_id, dealstage);
CREATE INDEX idx_deals_owner_open ON public.deals(owner_id) WHERE NOT hs_is_closed;
CREATE INDEX idx_deals_contact ON public.deals(contact_id);

-- Create deal_stage_changes table for gamification
CREATE TABLE public.deal_stage_changes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_stage text NOT NULL,
  to_stage text NOT NULL,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL
);

-- Enable RLS on deal_stage_changes
ALTER TABLE public.deal_stage_changes ENABLE ROW LEVEL SECURITY;

-- RLS policies for deal_stage_changes
CREATE POLICY "Users can view stage changes in their tenant"
  ON public.deal_stage_changes FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Service role can manage all stage changes"
  ON public.deal_stage_changes FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create indexes for querying weekly/monthly wins
CREATE INDEX idx_stage_changes_time ON public.deal_stage_changes(tenant_id, changed_at);
CREATE INDEX idx_stage_changes_owner ON public.deal_stage_changes(owner_id, changed_at);

-- Create trigger for updated_at on contacts
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on deals
CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();