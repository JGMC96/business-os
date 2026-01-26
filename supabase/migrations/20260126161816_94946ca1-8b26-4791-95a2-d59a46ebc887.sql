-- ============================================
-- MIGRACION CRITICA: Ajustes de Arquitectura
-- ============================================

-- 1.1 Eliminar user_roles (redundante)
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP TABLE IF EXISTS public.user_roles;

-- 1.2 Crear catalogo de plans
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_monthly NUMERIC(10,2) DEFAULT 0,
  price_yearly NUMERIC(10,2) DEFAULT 0,
  limits JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.plans (key, name, price_monthly, price_yearly, display_order, limits) VALUES
  ('free', 'Gratis', 0, 0, 1, '{"clients": 10, "invoices_per_month": 5}'),
  ('trial', 'Prueba', 0, 0, 2, '{"clients": 100, "invoices_per_month": 50}'),
  ('pro', 'Pro', 299, 2990, 3, '{"clients": 500, "invoices_per_month": 200}'),
  ('business', 'Business', 599, 5990, 4, '{"clients": -1, "invoices_per_month": -1}');

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active plans"
ON public.plans FOR SELECT
TO authenticated
USING (is_active = true);

-- 1.3 Crear catalogo de modules
CREATE TABLE public.modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.modules (key, name, description, display_order) VALUES
  ('clients', 'Clientes', 'Gestion de clientes y contactos', 1),
  ('products', 'Productos', 'Catalogo de productos y servicios', 2),
  ('invoicing', 'Facturacion', 'Emision y gestion de facturas', 3),
  ('payments', 'Pagos', 'Registro y seguimiento de pagos', 4),
  ('ai_advisor', 'Asesor IA', 'Asistente inteligente de negocios', 5),
  ('reports', 'Reportes', 'Reportes y estadisticas avanzadas', 6);

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active modules"
ON public.modules FOR SELECT
TO authenticated
USING (is_active = true);

-- 1.4 Crear plan_modules
CREATE TABLE public.plan_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  limits JSONB DEFAULT '{}',
  UNIQUE(plan_id, module_id)
);

INSERT INTO public.plan_modules (plan_id, module_id)
SELECT p.id, m.id FROM plans p, modules m 
WHERE p.key = 'free' AND m.key IN ('clients', 'products');

INSERT INTO public.plan_modules (plan_id, module_id)
SELECT p.id, m.id FROM plans p, modules m 
WHERE p.key = 'trial' AND m.key IN ('clients', 'products', 'invoicing', 'payments');

INSERT INTO public.plan_modules (plan_id, module_id)
SELECT p.id, m.id FROM plans p, modules m 
WHERE p.key = 'pro' AND m.key IN ('clients', 'products', 'invoicing', 'payments', 'ai_advisor');

INSERT INTO public.plan_modules (plan_id, module_id)
SELECT p.id, m.id FROM plans p, modules m 
WHERE p.key = 'business';

ALTER TABLE public.plan_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view plan modules"
ON public.plan_modules FOR SELECT
TO authenticated
USING (true);

-- 1.5 Modificar subscriptions (enum a FK)
ALTER TABLE public.subscriptions
  ADD COLUMN plan_id UUID REFERENCES public.plans(id);

UPDATE public.subscriptions s
SET plan_id = (SELECT id FROM plans WHERE key = s.plan::text)
WHERE plan_id IS NULL;

UPDATE public.subscriptions s
SET plan_id = (SELECT id FROM plans WHERE key = 'trial')
WHERE plan_id IS NULL;

ALTER TABLE public.subscriptions
  ALTER COLUMN plan_id SET NOT NULL;

ALTER TABLE public.subscriptions DROP COLUMN plan;

-- 1.6 Recrear business_modules
DROP POLICY IF EXISTS "Members can view modules" ON public.business_modules;
DROP POLICY IF EXISTS "Owner can manage modules" ON public.business_modules;
DROP TABLE IF EXISTS public.business_modules;

CREATE TABLE public.business_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  limits JSONB DEFAULT '{}',
  UNIQUE(business_id, module_id)
);

CREATE INDEX idx_business_modules_business ON public.business_modules(business_id);

ALTER TABLE public.business_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view modules"
ON public.business_modules FOR SELECT
TO authenticated
USING (is_member_of_business(business_id));

CREATE POLICY "Owner can manage modules"
ON public.business_modules FOR ALL
TO authenticated
USING (has_business_role(business_id, 'owner'))
WITH CHECK (has_business_role(business_id, 'owner'));

-- 1.7 Agregar active_business_id en profiles
ALTER TABLE public.profiles
  ADD COLUMN active_business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.set_active_business(_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_member_of_business(_business_id) THEN
    RAISE EXCEPTION 'No eres miembro de este negocio';
  END IF;
  
  UPDATE profiles
  SET active_business_id = _business_id,
      updated_at = now()
  WHERE id = auth.uid();
  
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_business()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT active_business_id FROM profiles WHERE id = auth.uid()
$$;

-- 1.8 Crear business_settings
CREATE TABLE public.business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  next_invoice_number INTEGER NOT NULL DEFAULT 1,
  invoice_prefix TEXT DEFAULT 'FAC-',
  tax_rate NUMERIC(5,2) DEFAULT 16.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_business_settings_business ON public.business_settings(business_id);

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view settings"
ON public.business_settings FOR SELECT
TO authenticated
USING (is_member_of_business(business_id));

CREATE POLICY "Owner/Admin can manage settings"
ON public.business_settings FOR ALL
TO authenticated
USING (has_min_role(business_id, 'admin'))
WITH CHECK (has_min_role(business_id, 'admin'));

CREATE TRIGGER update_business_settings_updated_at
  BEFORE UPDATE ON public.business_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.generate_invoice_number(_business_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings business_settings%ROWTYPE;
  _invoice_number TEXT;
BEGIN
  IF NOT is_member_of_business(_business_id) THEN
    RAISE EXCEPTION 'No tienes permiso para generar facturas en este negocio';
  END IF;

  SELECT * INTO _settings
  FROM business_settings
  WHERE business_id = _business_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    INSERT INTO business_settings (business_id, next_invoice_number, invoice_prefix)
    VALUES (_business_id, 2, 'FAC-')
    RETURNING * INTO _settings;
    
    RETURN 'FAC-' || LPAD('1', 6, '0');
  END IF;
  
  _invoice_number := _settings.invoice_prefix || LPAD(_settings.next_invoice_number::TEXT, 6, '0');
  
  UPDATE business_settings
  SET next_invoice_number = next_invoice_number + 1,
      updated_at = now()
  WHERE business_id = _business_id;
  
  RETURN _invoice_number;
END;
$$;

-- 1.9 Corregir policies UPDATE (agregar WITH CHECK)
DROP POLICY IF EXISTS "Members can update clients" ON public.clients;
CREATE POLICY "Members can update clients"
ON public.clients FOR UPDATE
TO authenticated
USING (is_member_of_business(business_id))
WITH CHECK (is_member_of_business(business_id));

DROP POLICY IF EXISTS "Members can update products" ON public.products;
CREATE POLICY "Members can update products"
ON public.products FOR UPDATE
TO authenticated
USING (is_member_of_business(business_id))
WITH CHECK (is_member_of_business(business_id));

DROP POLICY IF EXISTS "Members can update invoices" ON public.invoices;
CREATE POLICY "Members can update invoices"
ON public.invoices FOR UPDATE
TO authenticated
USING (is_member_of_business(business_id))
WITH CHECK (is_member_of_business(business_id));

DROP POLICY IF EXISTS "Members can update payments" ON public.payments;
CREATE POLICY "Members can update payments"
ON public.payments FOR UPDATE
TO authenticated
USING (is_member_of_business(business_id))
WITH CHECK (is_member_of_business(business_id));

DROP POLICY IF EXISTS "Owner/Admin can update members" ON public.business_members;
CREATE POLICY "Owner/Admin can update members"
ON public.business_members FOR UPDATE
TO authenticated
USING (has_min_role(business_id, 'admin'))
WITH CHECK (has_min_role(business_id, 'admin'));

-- 1.10 Mejorar auditoria
ALTER TABLE public.audit_logs
  ADD COLUMN actor_user_id UUID;

CREATE OR REPLACE FUNCTION public.audit_log_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _business_id uuid;
  _record_id uuid;
  _actor_id uuid;
BEGIN
  BEGIN
    _actor_id := current_setting('app.actor_user_id', true)::uuid;
  EXCEPTION WHEN OTHERS THEN
    _actor_id := NULL;
  END;
  
  _actor_id := COALESCE(_actor_id, auth.uid());

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
    actor_user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  ) VALUES (
    _business_id,
    auth.uid(),
    _actor_id,
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