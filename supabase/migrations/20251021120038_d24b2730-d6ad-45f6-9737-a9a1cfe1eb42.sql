-- Add portal_id column to tenants table
ALTER TABLE public.tenants 
ADD COLUMN portal_id text UNIQUE NOT NULL DEFAULT '';

-- Update existing rows to use hubspot_portal_id as portal_id
UPDATE public.tenants 
SET portal_id = COALESCE(hubspot_portal_id, id::text) 
WHERE portal_id = '';

-- Remove default value after backfilling
ALTER TABLE public.tenants 
ALTER COLUMN portal_id DROP DEFAULT;