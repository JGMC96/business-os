
# Plan: Corregir Política RLS de business_members para Onboarding

## Problema Identificado

El usuario **puede autenticarse correctamente** (ya hay sesión activa con JWT válido), pero **no puede completar el onboarding** porque falla al crear el primer `business_member`.

### Causa Raíz

La política RLS de INSERT en `business_members` tiene un bug de referencia ambigua:

```sql
-- Política actual (BUGGY)
CREATE POLICY "Owner/Admin can insert members"
ON public.business_members FOR INSERT
TO authenticated
WITH CHECK (
  public.has_min_role(business_id, 'admin')
  OR NOT EXISTS (SELECT 1 FROM business_members WHERE business_id = business_members.business_id)
);
```

**El problema:** En el subquery, `business_members.business_id` se refiere a la fila del propio subquery, no a la fila que se está insertando. Esto crea una auto-comparación que siempre es TRUE, haciendo que `NOT EXISTS` siempre sea FALSE.

**Resultado:** La condición "permitir si es el primer miembro del negocio" nunca se cumple, bloqueando el onboarding.

---

## Verificación del Diagnóstico

1. **Usuario autenticado:** ✅ Confirmado (bearer token válido en network requests)
2. **Tablas plan/modules:** ✅ Datos correctos (trial plan existe con módulos)
3. **Política businesses INSERT:** ✅ Funciona (`auth.uid() IS NOT NULL`)
4. **Política business_members INSERT:** ❌ Bug - bloquea primer miembro
5. **Base de datos:** 0 negocios, 0 business_members (nadie puede completar onboarding)

---

## Solución

### Nueva migración SQL

Reemplazar la política de INSERT en `business_members` con una versión corregida:

```sql
-- 1. Eliminar política buggy
DROP POLICY IF EXISTS "Owner/Admin can insert members" ON public.business_members;

-- 2. Crear política corregida
CREATE POLICY "Owner/Admin can insert members"
ON public.business_members FOR INSERT
TO authenticated
WITH CHECK (
  -- Caso 1: Usuario ya es admin+ del negocio (puede agregar más miembros)
  public.has_min_role(business_id, 'admin')
  OR 
  -- Caso 2: Es el primer miembro del negocio (fundador/owner)
  -- Usar NEW.business_id explícitamente para comparar con registros existentes
  NOT EXISTS (
    SELECT 1 FROM public.business_members bm 
    WHERE bm.business_id = business_members.business_id
  )
);
```

Nota: En el contexto de WITH CHECK, `business_members.business_id` se refiere al valor que se está insertando (NEW). La corrección es asignar un alias distinto (`bm`) a la tabla del subquery para evitar la ambigüedad.

Sin embargo, PostgreSQL en el contexto de RLS con WITH CHECK, la referencia sin alias apunta a la fila siendo insertada. El problema real es que el alias en la query original (`business_members_1`) fue generado mal.

**Solución definitiva:** Usar una referencia explícita al NEW row:

```sql
CREATE POLICY "Owner/Admin can insert members"
ON public.business_members FOR INSERT
TO authenticated
WITH CHECK (
  public.has_min_role(business_id, 'admin')
  OR 
  NOT EXISTS (
    SELECT 1 FROM public.business_members existing 
    WHERE existing.business_id = business_id
      AND existing.user_id IS NOT NULL  -- cualquier miembro existente
  )
);
```

---

## Archivo a Crear

| Archivo | Descripción |
|---------|-------------|
| `supabase/migrations/xxx_fix_business_members_insert_policy.sql` | Corrige política RLS |

---

## Contenido de la Migración

```sql
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
```

---

## Flujo Corregido

```text
1. Usuario se registra/inicia sesión
   -> Sesión activa ✅

2. Usuario llega a /onboarding
   -> Formulario visible ✅

3. Usuario crea negocio
   -> INSERT en businesses ✅ (política permite con auth.uid())
   -> Retorna business.id

4. Usuario se agrega como owner (CORREGIDO)
   -> INSERT en business_members
   -> NOT EXISTS evalúa: "¿hay alguien más en este negocio?" → FALSE
   -> Política permite el INSERT ✅

5. Resto del onboarding
   -> subscription, business_modules, business_settings
   -> Todas usan business_id del negocio recién creado

6. Navega a /dashboard ✅
```

---

## Checklist de Validación

- [ ] Registrar nuevo usuario
- [ ] Completar onboarding (crear negocio)
- [ ] Verificar que el usuario es owner en business_members
- [ ] Verificar subscription creada con plan trial
- [ ] Verificar business_modules habilitados
- [ ] Acceso al dashboard funciona
- [ ] Segundo usuario puede ser invitado por owner/admin

---

## Impacto

- **Crítico:** Sin esta corrección, ningún usuario nuevo puede usar la aplicación
- **Bajo riesgo:** Solo modifica una política de INSERT, no afecta datos existentes
- **Sin cambios en frontend:** El código de Onboarding.tsx ya es correcto

---

## Detalles Técnicos

### Por qué falló la política original

En PostgreSQL RLS, cuando escribes:

```sql
NOT EXISTS (SELECT 1 FROM business_members WHERE business_id = business_members.business_id)
```

El `business_members.business_id` de la derecha se resuelve al alias más cercano, que en este caso es la misma tabla del subquery. Esto crea `business_id = business_id` (auto-comparación), que siempre es TRUE (excepto NULL).

### Corrección

Usar un alias explícito para la tabla del subquery:

```sql
NOT EXISTS (SELECT 1 FROM business_members existing WHERE existing.business_id = business_id)
```

Aquí, `existing.business_id` es de la tabla existente, y `business_id` (sin prefijo) es la columna del NEW row que se está insertando.
