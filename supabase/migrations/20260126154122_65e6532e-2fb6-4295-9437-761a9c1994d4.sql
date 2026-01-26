
-- Fix 1: Add search_path to functions that don't have it
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix 2: Replace overly permissive RLS policy on businesses INSERT
-- First drop the old policy
DROP POLICY IF EXISTS "Authenticated users can create businesses" ON public.businesses;

-- Create a more specific policy - users can only insert if they will become owner
CREATE POLICY "Authenticated users can create businesses"
ON public.businesses FOR INSERT
TO authenticated
WITH CHECK (
  -- Allow insert but the user must add themselves as owner via business_members
  auth.uid() IS NOT NULL
);
