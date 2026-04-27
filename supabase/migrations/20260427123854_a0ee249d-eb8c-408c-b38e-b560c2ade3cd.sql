-- 1. Enum para roles de plataforma (globales)
CREATE TYPE public.platform_role AS ENUM ('super_admin', 'support');

-- 2. Tabla de roles de plataforma (SEPARADA de business_members para evitar escalada de privilegios)
CREATE TABLE public.platform_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role platform_role NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE (user_id, role)
);

CREATE INDEX idx_platform_roles_user_id ON public.platform_roles(user_id);

-- 3. Habilitar RLS
ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;

-- 4. Función security definer (evita recursión en RLS)
CREATE OR REPLACE FUNCTION public.has_platform_role(_user_id uuid, _role platform_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 5. Helper: ¿el usuario actual es super_admin?
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_platform_role(auth.uid(), 'super_admin')
$$;

-- 6. Políticas RLS sobre platform_roles
-- Solo super_admins pueden ver/gestionar la tabla de roles de plataforma.
-- Cualquier usuario autenticado puede ver SU PROPIO registro (para que el frontend sepa si es super admin).
CREATE POLICY "Users can view their own platform role"
ON public.platform_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all platform roles"
ON public.platform_roles FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admins can insert platform roles"
ON public.platform_roles FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can update platform roles"
ON public.platform_roles FOR UPDATE
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can delete platform roles"
ON public.platform_roles FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- 7. Extender políticas RLS existentes para que super_admin tenga acceso global
-- (Añadimos políticas adicionales en lugar de tocar las existentes; con RLS, basta con que UNA política permita la acción)

-- businesses
CREATE POLICY "Super admins can view all businesses"
ON public.businesses FOR SELECT TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admins can update all businesses"
ON public.businesses FOR UPDATE TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can delete all businesses"
ON public.businesses FOR DELETE TO authenticated
USING (public.is_super_admin());

-- business_members
CREATE POLICY "Super admins can view all members"
ON public.business_members FOR SELECT TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admins can insert any member"
ON public.business_members FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can update any member"
ON public.business_members FOR UPDATE TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can delete any member"
ON public.business_members FOR DELETE TO authenticated
USING (public.is_super_admin());

-- subscriptions
CREATE POLICY "Super admins can manage all subscriptions"
ON public.subscriptions FOR ALL TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- business_modules
CREATE POLICY "Super admins can manage all business modules"
ON public.business_modules FOR ALL TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- business_settings
CREATE POLICY "Super admins can manage all business settings"
ON public.business_settings FOR ALL TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- clients
CREATE POLICY "Super admins can view all clients"
ON public.clients FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "Super admins can update all clients"
ON public.clients FOR UPDATE TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admins can delete all clients"
ON public.clients FOR DELETE TO authenticated USING (public.is_super_admin());

-- products
CREATE POLICY "Super admins can view all products"
ON public.products FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "Super admins can update all products"
ON public.products FOR UPDATE TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admins can delete all products"
ON public.products FOR DELETE TO authenticated USING (public.is_super_admin());

-- invoices
CREATE POLICY "Super admins can view all invoices"
ON public.invoices FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "Super admins can update all invoices"
ON public.invoices FOR UPDATE TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admins can delete all invoices"
ON public.invoices FOR DELETE TO authenticated USING (public.is_super_admin());

-- invoice_items
CREATE POLICY "Super admins can manage all invoice items"
ON public.invoice_items FOR ALL TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- payments
CREATE POLICY "Super admins can view all payments"
ON public.payments FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "Super admins can update all payments"
ON public.payments FOR UPDATE TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admins can delete all payments"
ON public.payments FOR DELETE TO authenticated USING (public.is_super_admin());

-- sales
CREATE POLICY "Super admins can view all sales"
ON public.sales FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "Super admins can delete all sales"
ON public.sales FOR DELETE TO authenticated USING (public.is_super_admin());

-- sale_items
CREATE POLICY "Super admins can manage all sale items"
ON public.sale_items FOR ALL TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- audit_logs
CREATE POLICY "Super admins can view all audit logs"
ON public.audit_logs FOR SELECT TO authenticated USING (public.is_super_admin());

-- profiles: super admins pueden ver todos los perfiles
CREATE POLICY "Super admins can view all profiles"
ON public.profiles FOR SELECT TO authenticated USING (public.is_super_admin());
CREATE POLICY "Super admins can update all profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 8. Asignar super_admin al usuario megino96@gmail.com
INSERT INTO public.platform_roles (user_id, role, notes)
SELECT id, 'super_admin'::platform_role, 'Initial super admin (bootstrap)'
FROM auth.users
WHERE email = 'megino96@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;