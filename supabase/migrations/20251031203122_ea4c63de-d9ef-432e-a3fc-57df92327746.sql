-- Remove the foreign key constraint that prevents inserting HubSpot users
-- HubSpot users (sales reps) are different from authenticated system users
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;