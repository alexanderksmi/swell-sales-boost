-- Add hs_owner_id column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS hs_owner_id text;

-- Add default gen_random_uuid() to users.id for new inserts
ALTER TABLE public.users 
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Create unique index on (tenant_id, email) for upsert logic
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_ux 
ON public.users(tenant_id, email);