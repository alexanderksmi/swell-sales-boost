-- Update RLS policies to use JWT claims instead of database function

-- Drop existing tenant_id function since we'll use JWT claims
-- (Keep it for backward compatibility but update policies)

-- Create helper function to extract tenant_id from JWT claims
CREATE OR REPLACE FUNCTION public.get_tenant_id_from_jwt()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid,
    NULL
  )
$$;

-- Update user_id extraction function
CREATE OR REPLACE FUNCTION public.get_user_id_from_jwt()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'sub')::uuid,
    auth.uid()
  )
$$;