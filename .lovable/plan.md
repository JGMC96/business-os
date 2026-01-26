

# Plan Actualizado: Modulo de Clientes (MVP)

## Resumen

Implementacion completa del modulo de Clientes con CRUD multi-tenant, feature gating, validaciones y UX profesional. Incorpora todos los ajustes recomendados: indices trigram para busqueda "contiene", proteccion contra race conditions, normalizacion de datos y eliminacion de delete real.

---

## Estado Actual Verificado

### Base de Datos
- **Tabla `clients`**: Existe con campos correctos
- **Indices actuales**: `clients_pkey` (id), `idx_clients_business` (business_id)
- **Extension `pg_trgm`**: Disponible en Supabase (no activada aun)
- **RLS**: Politicas configuradas correctamente

### Frontend
- **Patron de naming**: Paginas sin sufijo (`Auth.tsx`, `Dashboard.tsx`)
- **Componentes dashboard**: En `src/components/dashboard/`
- **Tipos**: `Client` interface disponible en `src/types/database.ts`

---

## Arquitectura del Modulo

```text
/dashboard/clients
    |
    +-- Clients.tsx (contenedor principal)
         |
         +-- ClientsHeader.tsx (titulo, busqueda, filtros)
         +-- ClientsTable.tsx (listado con acciones)
         +-- ClientFormDialog.tsx (modal crear/editar)
         |
         +-- useClients.ts (hook para CRUD)
```

---

## Fase 1: Base de Datos

### 1.1 Activar pg_trgm e Indices Optimizados

```sql
-- Activar extension para busqueda "contiene"
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Indice compuesto para filtrado por estado (B-tree)
CREATE INDEX IF NOT EXISTS idx_clients_business_active 
ON public.clients(business_id, is_active);

-- Indices GIN para busqueda fuzzy con trigram
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm
ON public.clients USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_clients_email_trgm
ON public.clients USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_clients_phone_trgm
ON public.clients USING gin (phone gin_trgm_ops);
```

Estos indices permiten busquedas `ilike '%term%'` eficientes.

---

## Fase 2: Hook de Clientes

### Archivo: `src/hooks/useClients.ts`

**Caracteristicas clave:**

1. **Proteccion contra race conditions**: Usa `AbortController` o flag `cancelled` para evitar que respuestas tardias de queries anteriores contaminen el estado al cambiar de negocio.

2. **Query de busqueda optimizada**: Usa `.or()` de Supabase manteniendo el scope:
   ```typescript
   query
     .eq('business_id', activeBusinessId)
     .or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
   ```

3. **Sin delete real**: Solo expone `toggleClientStatus`, nunca `deleteClient`.

4. **Normalizacion al guardar**:
   - `phone`: elimina espacios y guiones
   - `email`: trim y lowercase

**Estructura del hook:**
```typescript
interface UseClientsReturn {
  clients: Client[];
  isLoading: boolean;
  error: Error | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  showInactive: boolean;
  setShowInactive: (show: boolean) => void;
  fetchClients: () => Promise<void>;
  createClient: (data: ClientFormData) => Promise<boolean>;
  updateClient: (id: string, data: ClientFormData) => Promise<boolean>;
  toggleClientStatus: (id: string, currentStatus: boolean) => Promise<boolean>;
}
```

**Implementacion de proteccion race condition:**
```typescript
useEffect(() => {
  let cancelled = false;
  
  const load = async () => {
    const { data } = await query...;
    if (!cancelled) {
      setClients(data);
    }
  };
  
  load();
  return () => { cancelled = true; };
}, [activeBusinessId, searchTerm, showInactive]);
```

---

## Fase 3: Componentes

### 3.1 Clients.tsx (Pagina Principal)

**Ruta:** `/dashboard/clients`

**Estructura:**
```text
RequireModule module="clients"
  |
  +-- div.space-y-6
       |
       +-- ClientsHeader
       +-- ClientsTable
       +-- ClientFormDialog
```

### 3.2 ClientsHeader.tsx

**UI:**
- Titulo "Clientes" con descripcion
- Input de busqueda (debounced 300ms)
- Switch "Mostrar inactivos"
- Boton "Nuevo cliente"

### 3.3 ClientsTable.tsx

**Columnas:**
| Columna | Contenido |
|---------|-----------|
| Nombre | name |
| Email | email (o "-") |
| Telefono | phone (o "-") |
| Empresa | company (o "-") |
| Estado | Badge Activo/Inactivo |
| Acciones | Menu dropdown |

**Acciones por fila (NO incluye Eliminar):**
- Editar
- Desactivar (si activo)
- Reactivar (si inactivo)

**Estados UI:**
- Loading: 5 skeleton rows
- Vacio: Ilustracion + CTA
- Sin resultados: Mensaje claro

### 3.4 ClientFormDialog.tsx

**Campos con normalizacion:**
| Campo | Tipo | Validacion | Normalizacion |
|-------|------|------------|---------------|
| name | text | min 2 chars | trim |
| email | email | formato valido | trim + lowercase |
| phone | tel | opcional | elimina espacios/guiones |
| company | text | opcional | trim |
| notes | textarea | opcional | trim |

**Schema Zod:**
```typescript
const clientSchema = z.object({
  name: z.string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string()
    .trim()
    .toLowerCase()
    .email('Email invalido')
    .optional()
    .or(z.literal('')),
  phone: z.string()
    .transform(v => v?.replace(/[\s\-]/g, ''))
    .optional(),
  company: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});
```

---

## Fase 4: Integracion

### 4.1 Dashboard.tsx

```tsx
<Routes>
  <Route index element={<DashboardOverview />} />
  <Route path="clients" element={<Clients />} />
</Routes>
```

---

## Fase 5: UX y Estados

### Toasts de Feedback

| Accion | Exito | Error |
|--------|-------|-------|
| Crear | "Cliente creado" | "Error al crear cliente" |
| Editar | "Cliente actualizado" | "Error al actualizar" |
| Desactivar | "Cliente desactivado" | "Error al desactivar" |
| Reactivar | "Cliente reactivado" | "Error al reactivar" |

### Debounce en Busqueda

300ms de delay para evitar queries excesivas mientras el usuario escribe.

---

## Archivos a Crear/Modificar

### Nuevos archivos

| Archivo | Descripcion |
|---------|-------------|
| `src/hooks/useClients.ts` | Hook CRUD con proteccion race condition |
| `src/pages/dashboard/Clients.tsx` | Pagina principal modulo |
| `src/components/clients/ClientsHeader.tsx` | Header con busqueda |
| `src/components/clients/ClientsTable.tsx` | Tabla sin boton delete |
| `src/components/clients/ClientFormDialog.tsx` | Modal con normalizacion |
| `supabase/migrations/XXXX_clients_trigram_indexes.sql` | Extension + indices |

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/Dashboard.tsx` | Agregar ruta /clients |

---

## Seguridad Implementada

1. **Multi-tenant**: Todas las queries con `business_id = activeBusinessId`
2. **RLS**: Base de datos valida membresia via `is_member_of_business()`
3. **Feature gating**: `RequireModule` bloquea acceso si modulo no habilitado
4. **Race condition**: Flag `cancelled` en useEffect previene estados inconsistentes
5. **Sin delete real**: Solo soft delete via `toggleClientStatus`
6. **Validacion + Normalizacion**: Zod procesa inputs antes de enviar
7. **created_by**: Asignado automaticamente desde `user.id`

---

## Orden de Implementacion

1. Migracion SQL (pg_trgm + indices)
2. Hook useClients con proteccion race condition
3. ClientFormDialog con normalizacion Zod
4. ClientsTable sin opcion delete
5. ClientsHeader con debounce
6. Clients.tsx (pagina contenedora)
7. Actualizar Dashboard.tsx con ruta
8. Testing manual

---

## Checklist Post-Implementacion

### Funcional
- [ ] Crear cliente con nombre minimo
- [ ] Editar cliente y ver cambios
- [ ] Desactivar cliente (is_active = false)
- [ ] Reactivar cliente inactivo
- [ ] Toggle mostrar/ocultar inactivos
- [ ] Busqueda por nombre/email/telefono funciona con "contiene"

### Seguridad
- [ ] No muestra nada si activeBusinessId es null
- [ ] Queries incluyen .eq('business_id', activeBusinessId)
- [ ] No existe boton/funcion de eliminar permanente
- [ ] Cambiar de negocio no mezcla datos (race condition protegida)

### Gating
- [ ] RequireModule bloquea si modulo no habilitado

