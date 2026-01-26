

# Plan: Implementar Actividad Reciente Real en Dashboard

## Resumen

Reemplazar los datos de ejemplo hardcodeados en el dashboard con actividad real del negocio, mostrando los últimos 10 eventos combinados de pagos, facturas y clientes nuevos.

---

## Diseño de la Solución

La actividad reciente combinará 3 tipos de eventos ordenados por fecha más reciente:

| Tipo | Fuente | Descripción |
|------|--------|-------------|
| `payment` | tabla `payments` | Pagos recibidos |
| `invoice` | tabla `invoices` | Facturas creadas |
| `client` | tabla `clients` | Clientes nuevos |

El RPC devolverá un máximo de 10 eventos, ordenados por `created_at DESC`.

---

## Archivos a Crear/Modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `supabase/migrations/xxx_add_get_recent_activity_rpc.sql` | Crear | Nueva función RPC |
| `src/hooks/useRecentActivity.ts` | Crear | Hook para consumir el RPC |
| `src/components/dashboard/DashboardOverview.tsx` | Modificar | Usar datos reales |

---

## Detalles Técnicos

### 1. Función RPC `get_recent_activity`

```sql
CREATE OR REPLACE FUNCTION public.get_recent_activity(
  _business_id uuid,
  _limit integer DEFAULT 10
)
RETURNS TABLE(
  event_type text,
  event_id uuid,
  title text,
  description text,
  amount numeric,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate membership
  IF NOT is_member_of_business(_business_id) THEN
    RAISE EXCEPTION 'No tienes permiso para ver actividad de este negocio';
  END IF;

  RETURN QUERY
  (
    -- Payments
    SELECT 
      'payment'::text AS event_type,
      p.id AS event_id,
      'Pago recibido'::text AS title,
      COALESCE(i.invoice_number, 'Sin factura')::text AS description,
      p.amount,
      p.created_at
    FROM payments p
    LEFT JOIN invoices i ON i.id = p.invoice_id
    WHERE p.business_id = _business_id

    UNION ALL

    -- Invoices
    SELECT 
      'invoice'::text AS event_type,
      inv.id AS event_id,
      CASE inv.status
        WHEN 'draft' THEN 'Factura borrador'
        WHEN 'sent' THEN 'Factura enviada'
        WHEN 'paid' THEN 'Factura pagada'
        WHEN 'overdue' THEN 'Factura vencida'
        ELSE 'Factura creada'
      END AS title,
      COALESCE(c.name, 'Sin cliente') || ' - ' || inv.invoice_number AS description,
      inv.total AS amount,
      inv.created_at
    FROM invoices inv
    LEFT JOIN clients c ON c.id = inv.client_id
    WHERE inv.business_id = _business_id

    UNION ALL

    -- New clients
    SELECT 
      'client'::text AS event_type,
      cl.id AS event_id,
      'Nuevo cliente'::text AS title,
      cl.name::text AS description,
      NULL::numeric AS amount,
      cl.created_at
    FROM clients cl
    WHERE cl.business_id = _business_id
  )
  ORDER BY created_at DESC
  LIMIT _limit;
END;
$$;
```

Esta función:
- Valida membresía antes de ejecutar
- Combina 3 fuentes con `UNION ALL`
- Ordena por fecha descendente
- Limita a N resultados (default 10)
- Usa `SECURITY DEFINER` para acceder a tablas con RLS

---

### 2. Hook `useRecentActivity.ts`

```typescript
// Interfaz para cada evento
interface ActivityEvent {
  event_type: 'payment' | 'invoice' | 'client';
  event_id: string;
  title: string;
  description: string;
  amount: number | null;
  created_at: string;
}

// Hook retorna
interface UseRecentActivityReturn {
  activities: ActivityEvent[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}
```

El hook:
- Usa `activeBusinessId` del contexto
- Llama al RPC `get_recent_activity`
- Implementa patrón anti-race-condition con `requestIdRef`
- Formatea fechas relativas ("Hace 2 horas", "Ayer")

---

### 3. Modificaciones a `DashboardOverview.tsx`

- Eliminar el array hardcodeado `recentActivity`
- Importar y usar `useRecentActivity`
- Adaptar el renderizado para usar el nuevo formato de datos
- Mostrar skeleton mientras carga
- Formatear montos con `formatPrice` existente
- Formatear fechas con función relativa (ej: "Hace 5 min")

---

## Formato de Fechas Relativas

Se creará una utilidad para formatear fechas:

```typescript
function formatRelativeTime(date: string): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffMins < 1440) return `Hace ${Math.floor(diffMins / 60)} h`;
  if (diffMins < 2880) return 'Ayer';
  return new Intl.DateTimeFormat('es-MX', { 
    day: 'numeric', 
    month: 'short' 
  }).format(past);
}
```

---

## Flujo de Datos

```text
1. Usuario entra al dashboard
   -> DashboardOverview monta

2. useRecentActivity se ejecuta
   -> Llama RPC get_recent_activity(business_id)

3. RPC valida membresía y ejecuta
   -> UNION de payments + invoices + clients
   -> ORDER BY created_at DESC LIMIT 10

4. Frontend recibe datos
   -> Mapea a componentes visuales
   -> Formatea montos y fechas

5. UI muestra actividad real
   -> Pagos con icono verde y monto positivo
   -> Facturas con estado y cliente
   -> Clientes nuevos sin monto
```

---

## Ejemplo Visual Final

| Icono | Título | Descripción | Monto | Tiempo |
|-------|--------|-------------|-------|--------|
| 💳 | Pago recibido | FAC-001 | +$5,000 | Hace 2 h |
| 📄 | Factura enviada | Cliente XYZ - FAC-002 | $3,500 | Hace 5 h |
| 👤 | Nuevo cliente | Empresa ABC | - | Ayer |

---

## Consideraciones de Rendimiento

- El RPC usa `LIMIT` para evitar cargar demasiados datos
- No hay JOINs innecesarios (solo para obtener nombres)
- Los índices existentes en `created_at` y `business_id` optimizan la query
- El hook tiene protección contra race conditions

---

## Seguridad

- RLS se bypasea con `SECURITY DEFINER` pero se valida membresía explícitamente
- Solo usuarios autenticados pueden llamar al RPC
- Los datos retornados son solo del negocio del usuario

