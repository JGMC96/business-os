
# Plan de Implementacion: TotalBusiness AI

## Resumen Ejecutivo

Construccion de una plataforma SaaS multi-tenant completa con aislamiento total de datos por negocio, sistema de roles, modulos activables por suscripcion y asesor IA contextual. Este plan cubre la arquitectura de base de datos, seguridad RLS, estructura de la aplicacion y flujos de usuario.

---

## Estado Actual

La aplicacion ya cuenta con:
- Landing page con Header, Hero, Features, Pricing y Footer
- Sistema de autenticacion basico (login/registro) con Supabase Auth
- Dashboard shell con sidebar, header y overview (datos de ejemplo)
- Sistema de diseno profesional configurado (colores, tipografia, componentes UI)
- Lovable Cloud habilitado (Supabase conectado)

**Faltante critico**: No existe base de datos, ni logica multi-tenant, ni RLS, ni roles.

---

## Fase 1: Arquitectura de Base de Datos Multi-Tenant

### 1.1 Tipos y Enums

```text
+------------------+     +------------------+     +------------------+
|   app_role       |     | subscription_plan|     | module_type      |
+------------------+     +------------------+     +------------------+
| owner            |     | free             |     | clients          |
| admin            |     | trial            |     | products         |
| staff            |     | pro              |     | invoicing        |
+------------------+     | business         |     | payments         |
                         +------------------+     | ai_advisor       |
                                                  | reports          |
                                                  +------------------+
```

### 1.2 Tablas Core del Sistema

**profiles** - Perfiles de usuario extendidos
- id (uuid, PK, referencia auth.users)
- full_name (text)
- avatar_url (text)
- created_at, updated_at

**businesses** - Negocios (tenants)
- id (uuid, PK)
- name (text, requerido)
- slug (text, unico)
- logo_url (text)
- industry (text)
- currency (text, default 'MXN')
- timezone (text, default 'America/Mexico_City')
- created_at, updated_at

**business_members** - Membresías usuario-negocio
- id (uuid, PK)
- business_id (uuid, FK businesses)
- user_id (uuid, FK auth.users)
- role (app_role)
- is_active (boolean, default true)
- invited_at, joined_at

**user_roles** - Roles de usuario (tabla separada por seguridad)
- id (uuid, PK)
- user_id (uuid, FK auth.users)
- role (app_role)
- unique(user_id, role)

### 1.3 Tablas de Suscripcion y Modulos

**subscriptions** - Suscripciones por negocio
- id (uuid, PK)
- business_id (uuid, FK businesses, unique)
- plan (subscription_plan)
- status (active, cancelled, past_due, trialing)
- trial_ends_at (timestamptz)
- current_period_start, current_period_end
- created_at, updated_at

**business_modules** - Modulos habilitados por negocio
- id (uuid, PK)
- business_id (uuid, FK businesses)
- module (module_type)
- is_enabled (boolean)
- limits (jsonb) - limites especificos del plan
- unique(business_id, module)

### 1.4 Tablas de Modulos Operativos

**clients** - Clientes del negocio
- id (uuid, PK)
- business_id (uuid, FK businesses, NOT NULL)
- name (text)
- email (text)
- phone (text)
- company (text)
- notes (text)
- is_active (boolean, default true)
- created_by (uuid, FK auth.users)
- created_at, updated_at

**products** - Productos/servicios
- id (uuid, PK)
- business_id (uuid, FK businesses, NOT NULL)
- name (text)
- description (text)
- price (numeric)
- unit (text)
- category (text)
- is_active (boolean, default true)
- created_by (uuid, FK auth.users)
- created_at, updated_at

**invoices** - Facturas
- id (uuid, PK)
- business_id (uuid, FK businesses, NOT NULL)
- client_id (uuid, FK clients)
- invoice_number (text)
- status (draft, sent, paid, overdue, cancelled)
- subtotal, tax, total (numeric)
- due_date (date)
- paid_at (timestamptz)
- notes (text)
- created_by (uuid, FK auth.users)
- created_at, updated_at

**invoice_items** - Items de factura
- id (uuid, PK)
- invoice_id (uuid, FK invoices)
- product_id (uuid, FK products)
- description (text)
- quantity (numeric)
- unit_price (numeric)
- total (numeric)

**payments** - Pagos recibidos
- id (uuid, PK)
- business_id (uuid, FK businesses, NOT NULL)
- invoice_id (uuid, FK invoices)
- amount (numeric)
- payment_method (text)
- payment_date (date)
- notes (text)
- created_by (uuid, FK auth.users)
- created_at, updated_at

### 1.5 Tabla de Auditoria

**audit_logs** - Registro de operaciones criticas
- id (uuid, PK)
- business_id (uuid, FK businesses)
- user_id (uuid, FK auth.users)
- action (text) - create, update, delete
- table_name (text)
- record_id (uuid)
- old_data (jsonb)
- new_data (jsonb)
- ip_address (text)
- created_at

---

## Fase 2: Seguridad RLS (Row Level Security)

### 2.1 Funcion de Verificacion de Membresia

```sql
-- Verificar si usuario es miembro activo de un negocio
create or replace function public.is_member_of_business(_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from business_members
    where business_id = _business_id
      and user_id = auth.uid()
      and is_active = true
  )
$$;
```

### 2.2 Funcion de Verificacion de Rol

```sql
-- Verificar rol del usuario en un negocio
create or replace function public.has_business_role(_business_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from business_members
    where business_id = _business_id
      and user_id = auth.uid()
      and role = _role
      and is_active = true
  )
$$;
```

### 2.3 Funcion de Minimo Rol

```sql
-- Verificar que usuario tiene al menos cierto rol
create or replace function public.has_min_role(_business_id uuid, _min_role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from business_members
    where business_id = _business_id
      and user_id = auth.uid()
      and is_active = true
      and (
        role = 'owner'
        or (role = 'admin' and _min_role in ('admin', 'staff'))
        or (role = 'staff' and _min_role = 'staff')
      )
  )
$$;
```

### 2.4 Politicas RLS por Tabla

Cada tabla operativa (clients, products, invoices, payments) tendra:
- SELECT: Solo miembros activos del negocio
- INSERT: Miembros activos + business_id validado
- UPDATE: Miembros activos + validacion de rol segun operacion
- DELETE: Solo owner/admin del negocio

---

## Fase 3: Estructura de Aplicacion Frontend

### 3.1 Contexto Global de Negocio Activo

```text
ActiveBusinessContext
|
+-- activeBusinessId: string | null
+-- activeBusiness: Business | null
+-- userBusinesses: Business[]
+-- userRole: 'owner' | 'admin' | 'staff' | null
+-- enabledModules: ModuleType[]
+-- setActiveBusiness: (id) => void
+-- refreshBusinesses: () => void
```

### 3.2 Estructura de Rutas

```text
/                      -> Landing page (publica)
/auth                  -> Login/Registro
/onboarding           -> Crear primer negocio
/select-business      -> Selector de negocio (si tiene varios)
/dashboard            -> Dashboard con validacion de negocio activo
  /dashboard/clients  -> Modulo clientes
  /dashboard/products -> Modulo productos
  /dashboard/invoices -> Modulo facturacion
  /dashboard/payments -> Modulo pagos
  /dashboard/ai       -> Asesor IA
  /dashboard/settings -> Configuracion del negocio
```

### 3.3 Componentes de Proteccion

- **RequireAuth**: Redirige a /auth si no autenticado
- **RequireBusiness**: Redirige a /onboarding si no tiene negocio
- **RequireModule**: Oculta/bloquea si modulo no habilitado
- **RequireRole**: Oculta/bloquea acciones segun rol

### 3.4 Hooks Personalizados

- useActiveBusiness() - Acceso al contexto de negocio
- useBusinessMembers() - Lista de miembros del negocio
- useModuleAccess(module) - Verificar acceso a modulo
- useRoleAccess(minRole) - Verificar permisos por rol

---

## Fase 4: Flujo de Usuario

### 4.1 Registro y Onboarding

```text
1. Usuario se registra en /auth
2. Auto-confirm activo (sin verificacion email)
3. Se crea perfil en profiles automaticamente (trigger)
4. Redirige a /onboarding
5. Crea su primer negocio
6. Se le asigna rol "owner"
7. Se crea suscripcion "trial" con modulos basicos
8. Redirige a /dashboard
```

### 4.2 Login con Multiples Negocios

```text
1. Usuario inicia sesion
2. Sistema consulta business_members
3. Si tiene 1 negocio -> activeBusinessId automatico
4. Si tiene 0 negocios -> /onboarding
5. Si tiene 2+ negocios -> /select-business
6. Dashboard carga con contexto del negocio activo
```

---

## Fase 5: Modulo de Asesor IA

### 5.1 Arquitectura

```text
Usuario pregunta
     |
     v
Edge Function: ai-advisor
     |
     v
1. Validar auth + business_id
2. Obtener rol del usuario
3. Determinar herramientas disponibles segun rol
4. Consultar datos del negocio (respetando scope)
5. Llamar a modelo IA con contexto
6. Retornar respuesta
```

### 5.2 Herramientas Internas del Asesor

El asesor IA actuara como orquestador con herramientas:
- get_business_summary: Resumen general del negocio
- get_revenue_stats: Ingresos del periodo
- get_pending_invoices: Facturas pendientes
- get_overdue_payments: Pagos vencidos
- get_top_clients: Mejores clientes
- get_recent_activity: Actividad reciente

### 5.3 Restricciones del Asesor

- Solo accede a datos del business_id activo
- Respeta limites del rol (staff no ve todo)
- Si no hay datos, responde "No tengo datos suficientes"
- Nunca inventa cifras
- Cita la fuente de los datos cuando aplica

---

## Fase 6: Sistema de Auditoria

### 6.1 Trigger de Auditoria

Se creara un trigger generico para tablas criticas:
- clients, products, invoices, payments
- Registra: INSERT, UPDATE, DELETE
- Captura: old_data, new_data, user_id, timestamp

### 6.2 Consulta de Auditoria

Solo owner/admin pueden ver audit_logs de su negocio.

---

## Archivos a Crear/Modificar

### Base de Datos (Migracion SQL)
1. Crear enums: app_role, subscription_plan, module_type
2. Crear tablas: profiles, businesses, business_members, user_roles, subscriptions, business_modules, clients, products, invoices, invoice_items, payments, audit_logs
3. Crear funciones: is_member_of_business, has_business_role, has_min_role
4. Crear politicas RLS para todas las tablas
5. Crear triggers: auto-crear profile, auditoria

### Frontend - Contexto y Hooks
- src/contexts/BusinessContext.tsx
- src/hooks/useActiveBusiness.ts
- src/hooks/useModuleAccess.ts
- src/hooks/useRoleAccess.ts

### Frontend - Componentes de Proteccion
- src/components/auth/RequireAuth.tsx
- src/components/auth/RequireBusiness.tsx
- src/components/auth/RequireModule.tsx
- src/components/auth/RequireRole.tsx

### Frontend - Paginas Nuevas
- src/pages/Onboarding.tsx
- src/pages/SelectBusiness.tsx
- src/pages/dashboard/Clients.tsx
- src/pages/dashboard/Products.tsx
- src/pages/dashboard/Invoices.tsx
- src/pages/dashboard/Payments.tsx
- src/pages/dashboard/AIAdvisor.tsx
- src/pages/dashboard/Settings.tsx

### Backend - Edge Functions
- supabase/functions/ai-advisor/index.ts
- supabase/functions/create-business/index.ts
- supabase/functions/business-stats/index.ts

---

## Orden de Implementacion

1. **Migracion de base de datos** - Crear toda la estructura SQL
2. **Contexto de negocio** - BusinessContext con logica de seleccion
3. **Componentes de proteccion** - RequireAuth, RequireBusiness
4. **Flujo de onboarding** - Crear primer negocio
5. **Modulos operativos** - Clientes, Productos, Facturas, Pagos
6. **Dashboard con datos reales** - Conectar a base de datos
7. **Asesor IA** - Edge function con herramientas
8. **Auditoria** - Triggers y visualizacion

---

## Consideraciones de Seguridad

- Todas las tablas operativas requieren business_id NOT NULL
- RLS habilitado en TODAS las tablas
- Roles almacenados en tabla separada (user_roles)
- Funciones security definer para verificacion de acceso
- Edge functions validan auth antes de cualquier operacion
- Nunca se acepta business_id del cliente sin validar membresia
- Auditoria de operaciones criticas

---

## Resultado Final

Al completar este plan, TotalBusiness AI sera:
- Un SaaS multi-tenant con aislamiento total de datos
- Seguro por diseno con RLS y validacion de roles
- Modular con activacion por plan
- Con IA responsable que respeta contexto y permisos
- Auditable para operaciones criticas
- Listo para vender y escalar
