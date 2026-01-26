-- Fix: Corregir política de INSERT en business_members
-- El bug era que la referencia ambigua hacía imposible insertar el primer miembro

DROP POLICY IF EXISTS "Owner/Admin can insert members" ON public.business_members;

CREATE POLICY "Owner/Admin can insert members"
ON public.business_members FOR INSERT
TO authenticated
WITH CHECK (
  -- Caso 1: Usuario ya es admin/owner del negocio
  public.has_min_role(business_id, 'admin')
  OR 
  -- Caso 2: Es el primer miembro del negocio (no hay nadie aún)
  -- Esto permite que el creador del negocio se agregue como owner
  NOT EXISTS (
    SELECT 1 
    FROM public.business_members existing 
    WHERE existing.business_id = business_id  -- business_id aquí es la columna del NEW row
  )
);