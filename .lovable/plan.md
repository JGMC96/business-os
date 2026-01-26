

# Plan: Corregir Política SELECT en businesses para Onboarding

## Problema Identificado

### Error
```
new row violates row-level security policy for table "businesses"
```

### Causa Raíz

El problema **NO está en la política INSERT**, que funciona correctamente (`auth.uid() IS NOT NULL`).

El problema está en la **cadena de operaciones** del frontend:
```javascript
await supabase
  .from('businesses')
  .insert({ name, slug, industry })
  .select()   // ← AQUÍ FALLA
  .single();
```

Cuando Supabase ejecuta `.insert(...).select()`, necesita:
1. ✅ Pasar la política INSERT (`auth.uid() IS NOT NULL`) - **OK**
2. ❌ Pasar la política SELECT (`is_member_of_business(id)`) - **FALLA**

**El usuario NO es miembro del negocio todavía** porque la inserción en `business_members` ocurre DESPUÉS. Por lo tanto, `is_member_of_business(id)` retorna FALSE y la operación completa falla.

---

## Flujo Actual (Fallido)

```text
1. Usuario crea negocio
   -> INSERT businesses ✅ (pasa la política INSERT)
   -> SELECT para retornar datos ❌ (is_member_of_business = FALSE)
   -> Operación completa falla con RLS error

2. business_members nunca se inserta (porque el paso 1 falló)
```

---

## Solución

Modificar la política SELECT de `businesses` para incluir un caso especial: **permitir SELECT de negocios que no tienen ningún miembro todavía** (recién creados).

### Nueva Política SELECT

```sql
DROP POLICY IF EXISTS "Members can view their businesses" ON public.businesses;

CREATE POLICY "Members can view their businesses"
ON public.businesses FOR SELECT
TO authenticated
USING (
  -- Caso 1: Usuario es miembro del negocio
  is_member_of_business(id)
  OR
  -- Caso 2: Negocio recién creado (sin miembros aún)
  -- Esto permite que el INSERT...SELECT funcione durante onboarding
  NOT EXISTS (
    SELECT 1 FROM public.business_members bm 
    WHERE bm.business_id = id
  )
);
```

### Por qué es seguro

1. **Negocios existentes**: Solo visibles para sus miembros (como antes)
2. **Negocios nuevos (0 miembros)**: Visibles temporalmente para cualquier usuario autenticado
3. **Ventana de exposición mínima**: Solo entre el INSERT del negocio y el INSERT del primer miembro (milisegundos)
4. **No hay datos sensibles**: Un negocio recién creado solo tiene name/slug/industry
5. **El primer miembro se agrega inmediatamente**: El onboarding lo hace en la siguiente línea

---

## Flujo Corregido

```text
1. Usuario crea negocio
   -> INSERT businesses ✅ (auth.uid() IS NOT NULL)
   -> SELECT businesses ✅ (NOT EXISTS members = TRUE para negocio nuevo)
   -> Retorna business.id

2. Usuario se agrega como owner
   -> INSERT business_members ✅ (NOT EXISTS = TRUE, es primer miembro)
   -> Ahora is_member_of_business = TRUE

3. Resto del onboarding
   -> subscription, business_modules, business_settings
   -> Todas pasan porque ya es miembro

4. Navega a /dashboard ✅
```

---

## Archivo a Crear

| Archivo | Descripción |
|---------|-------------|
| `supabase/migrations/xxx_fix_businesses_select_policy.sql` | Corrige política SELECT |

---

## Contenido de la Migración

```sql
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
```

---

## Alternativa Considerada (No elegida)

**Opción B**: Modificar el frontend para NO usar `.select()` después del insert y obtener el id de otra forma.

```javascript
// En lugar de:
const { data: business } = await supabase
  .from('businesses')
  .insert({...})
  .select()
  .single();

// Usar:
const { data: business } = await supabase
  .from('businesses')
  .insert({...})
  .select('id')  // Solo id, podría fallar igual
  .single();
```

**Razón para NO elegirla**: El problema persiste porque `.select()` siempre necesita pasar RLS. La solución en la política es más robusta.

---

## Checklist de Validación

- [ ] Registrar nuevo usuario
- [ ] Completar onboarding (crear negocio)
- [ ] Verificar que el INSERT + SELECT de businesses funciona
- [ ] Verificar que business_members se crea correctamente
- [ ] Verificar acceso al dashboard
- [ ] Verificar que usuarios NO pueden ver negocios de otros (que SÍ tienen miembros)

---

## Impacto

- **Crítico**: Sin esta corrección, el onboarding falla en el primer paso
- **Bajo riesgo**: Solo expone negocios sin miembros (estado transitorio de milisegundos)
- **Sin cambios en frontend**: El código de Onboarding.tsx ya es correcto
- **Retrocompatible**: No afecta negocios existentes que ya tienen miembros

---

## Detalles Técnicos

### Por qué `.insert().select()` necesita política SELECT

En PostgREST (el API de Supabase), cuando haces:
```
POST /rest/v1/businesses?select=*
```

Internamente ejecuta:
```sql
INSERT INTO businesses (...) VALUES (...) RETURNING *
```

Pero PostgREST aplica políticas RLS tanto al INSERT (WITH CHECK) como al resultado (USING de SELECT). Si el usuario no puede ver la fila, la operación falla con RLS error.

### Patrón común en Supabase

Este es un patrón conocido cuando:
1. Una tabla tiene política SELECT basada en membresía
2. La membresía se crea DESPUÉS del insert principal
3. El frontend usa `.insert().select()` para obtener el id

La solución estándar es permitir SELECT de registros "huérfanos" (sin membresías asociadas).

