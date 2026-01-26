
-- ============================================
-- FASE 1: ENUMS Y TIPOS
-- ============================================

-- Roles de usuario en negocios
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'staff');

-- Planes de suscripción
CREATE TYPE public.subscription_plan AS ENUM ('free', 'trial', 'pro', 'business');

-- Estado de suscripción
CREATE TYPE public.subscription_status AS ENUM ('active', 'cancelled', 'past_due', 'trialing');

-- Tipos de módulos
CREATE TYPE public.module_type AS ENUM ('clients', 'products', 'invoicing', 'payments', 'ai_advisor', 'reports');

-- Estado de facturas
CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');

-- ============================================
-- FASE 2: TABLAS CORE
-- ============================================

-- Perfiles de usuario (extendido de auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Negocios (tenants)
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  logo_url TEXT,
  industry TEXT,
  currency TEXT NOT NULL DEFAULT 'MXN',
  timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Membresías usuario-negocio
CREATE TABLE public.business_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'staff',
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(business_id, user_id)
);

-- Roles de usuario (tabla separada para seguridad)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- ============================================
-- FASE 3: TABLAS DE SUSCRIPCION Y MODULOS
-- ============================================

-- Suscripciones por negocio
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan public.subscription_plan NOT NULL DEFAULT 'trial',
  status public.subscription_status NOT NULL DEFAULT 'trialing',
  trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days'),
  current_period_start TIMESTAMPTZ DEFAULT now(),
  current_period_end TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Módulos habilitados por negocio
CREATE TABLE public.business_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  module public.module_type NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  limits JSONB DEFAULT '{}',
  UNIQUE(business_id, module)
);

-- ============================================
-- FASE 4: TABLAS OPERATIVAS
-- ============================================

-- Clientes del negocio
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Productos/servicios
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'unidad',
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Facturas
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Items de factura
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0
);

-- Pagos recibidos
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL,
  payment_method TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- FASE 5: TABLA DE AUDITORIA
-- ============================================

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- FASE 6: INDICES
-- ============================================

CREATE INDEX idx_business_members_user ON public.business_members(user_id);
CREATE INDEX idx_business_members_business ON public.business_members(business_id);
CREATE INDEX idx_clients_business ON public.clients(business_id);
CREATE INDEX idx_products_business ON public.products(business_id);
CREATE INDEX idx_invoices_business ON public.invoices(business_id);
CREATE INDEX idx_invoices_client ON public.invoices(client_id);
CREATE INDEX idx_payments_business ON public.payments(business_id);
CREATE INDEX idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX idx_audit_logs_business ON public.audit_logs(business_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- ============================================
-- FASE 7: FUNCIONES DE SEGURIDAD
-- ============================================

-- Verificar si usuario es miembro activo de un negocio
CREATE OR REPLACE FUNCTION public.is_member_of_business(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = _business_id
      AND user_id = auth.uid()
      AND is_active = true
  )
$$;

-- Verificar rol del usuario en un negocio
CREATE OR REPLACE FUNCTION public.has_business_role(_business_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = _business_id
      AND user_id = auth.uid()
      AND role = _role
      AND is_active = true
  )
$$;

-- Verificar que usuario tiene al menos cierto rol (owner > admin > staff)
CREATE OR REPLACE FUNCTION public.has_min_role(_business_id uuid, _min_role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = _business_id
      AND user_id = auth.uid()
      AND is_active = true
      AND (
        role = 'owner'
        OR (role = 'admin' AND _min_role IN ('admin', 'staff'))
        OR (role = 'staff' AND _min_role = 'staff')
      )
  )
$$;

-- Función para obtener el rol del usuario en un negocio
CREATE OR REPLACE FUNCTION public.get_user_role_in_business(_business_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM business_members
  WHERE business_id = _business_id
    AND user_id = auth.uid()
    AND is_active = true
  LIMIT 1
$$;

-- ============================================
-- FASE 8: HABILITAR RLS EN TODAS LAS TABLAS
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- FASE 9: POLITICAS RLS - PROFILES
-- ============================================

CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- ============================================
-- FASE 10: POLITICAS RLS - BUSINESSES
-- ============================================

CREATE POLICY "Members can view their businesses"
ON public.businesses FOR SELECT
TO authenticated
USING (public.is_member_of_business(id));

CREATE POLICY "Authenticated users can create businesses"
ON public.businesses FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Owner/Admin can update business"
ON public.businesses FOR UPDATE
TO authenticated
USING (public.has_min_role(id, 'admin'));

CREATE POLICY "Only owner can delete business"
ON public.businesses FOR DELETE
TO authenticated
USING (public.has_business_role(id, 'owner'));

-- ============================================
-- FASE 11: POLITICAS RLS - BUSINESS_MEMBERS
-- ============================================

CREATE POLICY "Members can view members of their business"
ON public.business_members FOR SELECT
TO authenticated
USING (public.is_member_of_business(business_id));

CREATE POLICY "Owner/Admin can insert members"
ON public.business_members FOR INSERT
TO authenticated
WITH CHECK (
  public.has_min_role(business_id, 'admin')
  OR NOT EXISTS (SELECT 1 FROM business_members WHERE business_id = business_members.business_id)
);

CREATE POLICY "Owner/Admin can update members"
ON public.business_members FOR UPDATE
TO authenticated
USING (public.has_min_role(business_id, 'admin'));

CREATE POLICY "Owner can delete members"
ON public.business_members FOR DELETE
TO authenticated
USING (public.has_business_role(business_id, 'owner'));

-- ============================================
-- FASE 12: POLITICAS RLS - USER_ROLES
-- ============================================

CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- ============================================
-- FASE 13: POLITICAS RLS - SUBSCRIPTIONS
-- ============================================

CREATE POLICY "Members can view subscription"
ON public.subscriptions FOR SELECT
TO authenticated
USING (public.is_member_of_business(business_id));

CREATE POLICY "Owner can manage subscription"
ON public.subscriptions FOR ALL
TO authenticated
USING (public.has_business_role(business_id, 'owner'));

-- ============================================
-- FASE 14: POLITICAS RLS - BUSINESS_MODULES
-- ============================================

CREATE POLICY "Members can view modules"
ON public.business_modules FOR SELECT
TO authenticated
USING (public.is_member_of_business(business_id));

CREATE POLICY "Owner can manage modules"
ON public.business_modules FOR ALL
TO authenticated
USING (public.has_business_role(business_id, 'owner'));

-- ============================================
-- FASE 15: POLITICAS RLS - CLIENTS
-- ============================================

CREATE POLICY "Members can view clients"
ON public.clients FOR SELECT
TO authenticated
USING (public.is_member_of_business(business_id));

CREATE POLICY "Members can create clients"
ON public.clients FOR INSERT
TO authenticated
WITH CHECK (public.is_member_of_business(business_id));

CREATE POLICY "Members can update clients"
ON public.clients FOR UPDATE
TO authenticated
USING (public.is_member_of_business(business_id));

CREATE POLICY "Owner/Admin can delete clients"
ON public.clients FOR DELETE
TO authenticated
USING (public.has_min_role(business_id, 'admin'));

-- ============================================
-- FASE 16: POLITICAS RLS - PRODUCTS
-- ============================================

CREATE POLICY "Members can view products"
ON public.products FOR SELECT
TO authenticated
USING (public.is_member_of_business(business_id));

CREATE POLICY "Members can create products"
ON public.products FOR INSERT
TO authenticated
WITH CHECK (public.is_member_of_business(business_id));

CREATE POLICY "Members can update products"
ON public.products FOR UPDATE
TO authenticated
USING (public.is_member_of_business(business_id));

CREATE POLICY "Owner/Admin can delete products"
ON public.products FOR DELETE
TO authenticated
USING (public.has_min_role(business_id, 'admin'));

-- ============================================
-- FASE 17: POLITICAS RLS - INVOICES
-- ============================================

CREATE POLICY "Members can view invoices"
ON public.invoices FOR SELECT
TO authenticated
USING (public.is_member_of_business(business_id));

CREATE POLICY "Members can create invoices"
ON public.invoices FOR INSERT
TO authenticated
WITH CHECK (public.is_member_of_business(business_id));

CREATE POLICY "Members can update invoices"
ON public.invoices FOR UPDATE
TO authenticated
USING (public.is_member_of_business(business_id));

CREATE POLICY "Owner/Admin can delete invoices"
ON public.invoices FOR DELETE
TO authenticated
USING (public.has_min_role(business_id, 'admin'));

-- ============================================
-- FASE 18: POLITICAS RLS - INVOICE_ITEMS
-- ============================================

CREATE POLICY "Members can view invoice items"
ON public.invoice_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM invoices 
    WHERE invoices.id = invoice_items.invoice_id 
    AND public.is_member_of_business(invoices.business_id)
  )
);

CREATE POLICY "Members can manage invoice items"
ON public.invoice_items FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM invoices 
    WHERE invoices.id = invoice_items.invoice_id 
    AND public.is_member_of_business(invoices.business_id)
  )
);

-- ============================================
-- FASE 19: POLITICAS RLS - PAYMENTS
-- ============================================

CREATE POLICY "Members can view payments"
ON public.payments FOR SELECT
TO authenticated
USING (public.is_member_of_business(business_id));

CREATE POLICY "Members can create payments"
ON public.payments FOR INSERT
TO authenticated
WITH CHECK (public.is_member_of_business(business_id));

CREATE POLICY "Members can update payments"
ON public.payments FOR UPDATE
TO authenticated
USING (public.is_member_of_business(business_id));

CREATE POLICY "Owner/Admin can delete payments"
ON public.payments FOR DELETE
TO authenticated
USING (public.has_min_role(business_id, 'admin'));

-- ============================================
-- FASE 20: POLITICAS RLS - AUDIT_LOGS
-- ============================================

CREATE POLICY "Owner/Admin can view audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.has_min_role(business_id, 'admin'));

-- ============================================
-- FASE 21: TRIGGERS - AUTO CREATE PROFILE
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- FASE 22: TRIGGERS - UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- FASE 23: TRIGGER - AUDITORIA
-- ============================================

CREATE OR REPLACE FUNCTION public.audit_log_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _business_id uuid;
  _record_id uuid;
BEGIN
  -- Obtener business_id y record_id según la operación
  IF TG_OP = 'DELETE' THEN
    _business_id := OLD.business_id;
    _record_id := OLD.id;
  ELSE
    _business_id := NEW.business_id;
    _record_id := NEW.id;
  END IF;

  INSERT INTO public.audit_logs (
    business_id,
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  ) VALUES (
    _business_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    _record_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Aplicar trigger de auditoría a tablas críticas
CREATE TRIGGER audit_clients_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

CREATE TRIGGER audit_products_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

CREATE TRIGGER audit_invoices_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

CREATE TRIGGER audit_payments_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
