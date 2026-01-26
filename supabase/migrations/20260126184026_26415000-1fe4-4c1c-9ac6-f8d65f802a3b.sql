-- Fix: Permitir SELECT de negocios recién creados (sin miembros aún)
-- Esto permite que el flujo INSERT...SELECT del onboarding funcione

DROP POLICY IF EXISTS "Members can view their businesses" ON public.businesses;

CREATE POLICY "Members can view their businesses"
ON public.businesses FOR SELECT
TO authenticated
USING (
  -- Caso 1: Usuario es miembro activo del negocio
  public.is_member_of_business(id)
  OR
  -- Caso 2: Negocio recién creado sin miembros (permite INSERT...SELECT en onboarding)
  NOT EXISTS (
    SELECT 1 FROM public.business_members bm 
    WHERE bm.business_id = id
  )
);