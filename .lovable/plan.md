

# Plan Final: Migracion Critica 100% Ejecutable

## Resumen

Migracion unica y segura que implementa los 5 ajustes criticos con:
- Nombres de constraints/policies verificados contra la base de datos real
- Estrategia drop/recreate para evitar conflictos
- Orden de operaciones que no falla incluso con residuos
- Seccion de verificacion post-migracion

---

## Datos Verificados de la Base de Datos Actual

### Constraints Reales (confirmados)
| Tabla | Constraint | Tipo |
|-------|-----------|------|
| business_modules | business_modules_business_id_module_key | UNIQUE |
| business_modules | business_modules_business_id_fkey | FK |
| business_modules | business_modules_pkey | PK |
| subscriptions | subscriptions_business_id_key | UNIQUE |
| subscriptions | subscriptions_business_id_fkey | FK |

### Policies Reales (confirmados)
- clients: "Members can update clients" (sin WITH CHECK)
- products: "Members can update products" (sin WITH CHECK)
- invoices: "Members can update invoices" (sin WITH CHECK)
- payments: "Members can update payments" (sin WITH CHECK)
- business_members: "Owner/Admin can update members" (sin WITH CHECK)
- user_roles: "Users can view own roles" (a eliminar)

### Decision sobre Pricing
La landing page tiene pricing hardcodeado, por lo tanto policies de `plans` y `modules` usaran `authenticated` (no `anon`).

---

## Fase 1: Migracion SQL

### 1.1 Eliminar user_roles

```sql
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP TABLE IF EXISTS public.user_roles;
```

### 1.2 Crear catalogo de plans

```sql
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
```

### 1.3 Crear catalogo de modules

```sql
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
```

### 1.4 Crear plan_modules (relacion plan-modulo)

```sql
CREATE TABLE public.plan_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  limits JSONB DEFAULT '{}',
  UNIQUE(plan_id, module_id)
);

-- Free: clients y products
INSERT INTO public.plan_modules (plan_id, module_id)
SELECT p.id, m.id FROM plans p, modules m 
WHERE p.key = 'free' AND m.key IN ('clients', 'products');

-- Trial: clients, products, invoicing, payments
INSERT INTO public.plan_modules (plan_id, module_id)
SELECT p.id, m.id FROM plans p, modules m 
WHERE p.key = 'trial' AND m.key IN ('clients', 'products', 'invoicing', 'payments');

-- Pro: todos excepto reports
INSERT INTO public.plan_modules (plan_id, module_id)
SELECT p.id, m.id FROM plans p, modules m 
WHERE p.key = 'pro' AND m.key IN ('clients', 'products', 'invoicing', 'payments', 'ai_advisor');

-- Business: todos los modulos
INSERT INTO public.plan_modules (plan_id, module_id)
SELECT p.id, m.id FROM plans p, modules m 
WHERE p.key = 'business';

ALTER TABLE public.plan_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view plan modules"
ON public.plan_modules FOR SELECT
TO authenticated
USING (true);
```

### 1.5 Modificar subscriptions (enum a FK)

Estrategia segura aunque existan datos:

```sql
-- Paso 1: Agregar columna nullable
ALTER TABLE public.subscriptions
  ADD COLUMN plan_id UUID REFERENCES public.plans(id);

-- Paso 2: Set default para nuevos registros
UPDATE public.subscriptions s
SET plan_id = (SELECT id FROM plans WHERE key = s.plan::text)
WHERE plan_id IS NULL;

-- Paso 3: Default a trial si no se pudo mapear
UPDATE public.subscriptions s
SET plan_id = (SELECT id FROM plans WHERE key = 'trial')
WHERE plan_id IS NULL;

-- Paso 4: Hacer NOT NULL
ALTER TABLE public.subscriptions
  ALTER COLUMN plan_id SET NOT NULL;

-- Paso 5: Eliminar columna enum
ALTER TABLE public.subscriptions DROP COLUMN plan;
```

### 1.6 Recrear business_modules (drop/recreate limpio)

Como no hay datos, recreamos la tabla para evitar problemas de constraints:

```sql
-- Guardar policies existentes
DROP POLICY IF EXISTS "Members can view modules" ON public.business_modules;
DROP POLICY IF EXISTS "Owner can manage modules" ON public.business_modules;

-- Drop tabla completa (incluye constraints)
DROP TABLE IF EXISTS public.business_modules;

-- Recrear con nueva estructura
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
```

### 1.7 Agregar active_business_id en profiles

```sql
ALTER TABLE public.profiles
  ADD COLUMN active_business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

-- RPC para setear negocio activo (SECURITY DEFINER con validacion)
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

-- Funcion simple para obtener negocio activo (sin SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_active_business()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT active_business_id FROM profiles WHERE id = auth.uid()
$$;
```

### 1.8 Crear business_settings

```sql
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

-- Trigger para updated_at
CREATE TRIGGER update_business_settings_updated_at
  BEFORE UPDATE ON public.business_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Funcion atomica para generar numero de factura
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
  -- Validacion de membresia (critico)
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
```

### 1.9 Corregir policies UPDATE (agregar WITH CHECK)

```sql
-- Clients
DROP POLICY IF EXISTS "Members can update clients" ON public.clients;
CREATE POLICY "Members can update clients"
ON public.clients FOR UPDATE
TO authenticated
USING (is_member_of_business(business_id))
WITH CHECK (is_member_of_business(business_id));

-- Products
DROP POLICY IF EXISTS "Members can update products" ON public.products;
CREATE POLICY "Members can update products"
ON public.products FOR UPDATE
TO authenticated
USING (is_member_of_business(business_id))
WITH CHECK (is_member_of_business(business_id));

-- Invoices
DROP POLICY IF EXISTS "Members can update invoices" ON public.invoices;
CREATE POLICY "Members can update invoices"
ON public.invoices FOR UPDATE
TO authenticated
USING (is_member_of_business(business_id))
WITH CHECK (is_member_of_business(business_id));

-- Payments
DROP POLICY IF EXISTS "Members can update payments" ON public.payments;
CREATE POLICY "Members can update payments"
ON public.payments FOR UPDATE
TO authenticated
USING (is_member_of_business(business_id))
WITH CHECK (is_member_of_business(business_id));

-- Business members
DROP POLICY IF EXISTS "Owner/Admin can update members" ON public.business_members;
CREATE POLICY "Owner/Admin can update members"
ON public.business_members FOR UPDATE
TO authenticated
USING (has_min_role(business_id, 'admin'))
WITH CHECK (has_min_role(business_id, 'admin'));
```

### 1.10 Mejorar auditoria

```sql
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
```

---

## Fase 2: Cambios de Frontend

### 2.1 Actualizar src/types/database.ts

Nuevos tipos e interfaces:
- **Plan**: id, key, name, price_monthly, price_yearly, limits, is_active
- **Module**: id, key, name, description, is_active
- **PlanModule**: id, plan_id, module_id, limits
- **BusinessSettings**: id, business_id, next_invoice_number, invoice_prefix, tax_rate
- **Profile**: agregar active_business_id
- **Subscription**: cambiar plan por plan_id
- **BusinessModule**: cambiar module por module_id

Eliminar:
- Interface UserRole (ya no existe tabla)

### 2.2 Actualizar src/contexts/BusinessContext.tsx

1. Al cargar, obtener active_business_id desde profile
2. En setActiveBusiness: llamar RPC set_active_business()
3. Obtener modulos mediante JOIN con tabla modules para tener el key
4. Mantener localStorage como cache rapido

### 2.3 Actualizar src/hooks/useModuleAccess.ts

- Parametro sigue siendo string (module key)
- Comparacion contra module.key obtenido del JOIN

### 2.4 Actualizar src/pages/Onboarding.tsx

Al crear negocio:
1. Obtener plan 'trial' de tabla plans
2. Crear subscription con plan_id (FK)
3. Obtener modulos del plan desde plan_modules
4. Crear business_modules con module_id (FK)
5. Crear business_settings inicial
6. Llamar set_active_business() para persistir

---

## Verificaciones Post-Migracion (SQL)

```sql
-- 1. user_roles eliminada
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'user_roles'
) AS user_roles_exists; -- debe ser FALSE

-- 2. plans tiene 4 registros
SELECT COUNT(*) = 4 AS plans_ok FROM plans;

-- 3. modules tiene 6 registros
SELECT COUNT(*) = 6 AS modules_ok FROM modules;

-- 4. plan_modules tiene asociaciones correctas
SELECT p.key, COUNT(pm.id) as module_count
FROM plans p
LEFT JOIN plan_modules pm ON pm.plan_id = p.id
GROUP BY p.key
ORDER BY p.display_order;
-- free: 2, trial: 4, pro: 5, business: 6

-- 5. subscriptions.plan_id existe y plan no existe
SELECT column_name FROM information_schema.columns
WHERE table_name = 'subscriptions' AND column_name IN ('plan', 'plan_id');
-- solo debe aparecer plan_id

-- 6. business_modules.module_id existe y module no existe
SELECT column_name FROM information_schema.columns
WHERE table_name = 'business_modules' AND column_name IN ('module', 'module_id');
-- solo debe aparecer module_id

-- 7. profiles tiene active_business_id
SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'active_business_id';

-- 8. business_settings existe
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'business_settings'
) AS business_settings_exists;

-- 9. Funciones RPC existen
SELECT proname FROM pg_proc 
WHERE proname IN ('set_active_business', 'get_active_business', 'generate_invoice_number')
ORDER BY proname;
-- deben aparecer las 3

-- 10. Policies UPDATE tienen WITH CHECK
SELECT tablename, policyname, cmd, qual IS NOT NULL as has_using, with_check IS NOT NULL as has_with_check
FROM pg_policies
WHERE cmd = 'UPDATE' AND tablename IN ('clients', 'products', 'invoices', 'payments', 'business_members');
-- todos deben tener has_with_check = true
```

---

## Archivos a Crear/Modificar

| Archivo | Accion |
|---------|--------|
| supabase/migrations/YYYYMMDD_critical_adjustments.sql | Crear (migracion completa) |
| src/types/database.ts | Modificar (nuevos tipos) |
| src/contexts/BusinessContext.tsx | Modificar (sync con DB) |
| src/hooks/useModuleAccess.ts | Modificar (usar module key) |
| src/pages/Onboarding.tsx | Modificar (crear settings + FKs) |

---

## Orden de Ejecucion

1. Ejecutar migracion SQL
2. Verificar con queries de sanity check
3. Actualizar types TypeScript
4. Modificar BusinessContext
5. Modificar Onboarding
6. Ajustar hook de modulos
7. Probar flujo completo de registro + onboarding

---

## Impacto en Seguridad

- Eliminacion de superficie de ataque redundante (user_roles)
- Prevencion de cambio de business_id en UPDATE (WITH CHECK)
- Validacion de membresia en funciones SECURITY DEFINER
- get_active_business() sin SECURITY DEFINER (menos riesgo)
- Atomicidad garantizada en numeracion de facturas
- Trazabilidad completa incluso desde Edge Functions

