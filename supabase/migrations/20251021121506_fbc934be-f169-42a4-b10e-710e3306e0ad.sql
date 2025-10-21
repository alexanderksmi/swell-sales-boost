-- Ensure email is NOT NULL in users table
ALTER TABLE public.users 
ALTER COLUMN email SET NOT NULL;

-- Create unique index on (tenant_id, email) for upsert
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_ux 
ON public.users(tenant_id, email);

-- Create unique index on portal_id for tenants
CREATE UNIQUE INDEX IF NOT EXISTS tenants_portal_id_ux 
ON public.tenants(portal_id);