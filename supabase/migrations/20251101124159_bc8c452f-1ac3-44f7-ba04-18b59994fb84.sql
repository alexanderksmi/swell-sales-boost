-- Create activities tables for caching HubSpot data

-- Meetings table
CREATE TABLE IF NOT EXISTS public.meetings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hubspot_meeting_id text NOT NULL,
  hs_timestamp bigint,
  hubspot_owner_id text,
  hs_created_by_user_id text,
  owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, hubspot_meeting_id)
);

-- Calls table
CREATE TABLE IF NOT EXISTS public.calls (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hubspot_call_id text NOT NULL,
  hs_timestamp bigint,
  hubspot_owner_id text,
  hs_created_by_user_id text,
  owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, hubspot_call_id)
);

-- Emails table
CREATE TABLE IF NOT EXISTS public.emails (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hubspot_email_id text NOT NULL,
  hs_timestamp bigint,
  hubspot_owner_id text,
  hs_created_by_user_id text,
  owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, hubspot_email_id)
);

-- Enable Row Level Security
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

-- RLS Policies for meetings
CREATE POLICY "Users can view meetings in their tenant"
  ON public.meetings
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Service role can manage all meetings"
  ON public.meetings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS Policies for calls
CREATE POLICY "Users can view calls in their tenant"
  ON public.calls
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Service role can manage all calls"
  ON public.calls
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS Policies for emails
CREATE POLICY "Users can view emails in their tenant"
  ON public.emails
  FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Service role can manage all emails"
  ON public.emails
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_meetings_tenant_owner ON public.meetings(tenant_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_meetings_timestamp ON public.meetings(hs_timestamp);
CREATE INDEX IF NOT EXISTS idx_calls_tenant_owner ON public.calls(tenant_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_calls_timestamp ON public.calls(hs_timestamp);
CREATE INDEX IF NOT EXISTS idx_emails_tenant_owner ON public.emails(tenant_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_emails_timestamp ON public.emails(hs_timestamp);

-- Create triggers for updated_at
CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_calls_updated_at
  BEFORE UPDATE ON public.calls
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_emails_updated_at
  BEFORE UPDATE ON public.emails
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();