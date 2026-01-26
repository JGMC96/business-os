
# Plan: Mejoras al RPC de Pagos + RPC Transaccional de Facturas + Metricas MVP

## Resumen

Este plan aborda tres objetivos:
1. **Refinar el RPC `create_payment_and_recalc_invoice`** con validaciones adicionales y logica de estado robusta
2. **Crear RPC transaccional `create_invoice_with_items`** para atomicidad completa en facturas
3. **Implementar metricas reales en el Dashboard** reemplazando datos hardcodeados

---

## Analisis del Estado Actual

### RPC de Pagos (Revisado)

El RPC actual `create_payment_and_recalc_invoice` tiene:
- Validacion de membresia via `is_member_of_business()`
- Lock `FOR UPDATE` sobre la factura
- Validacion de status (no draft/cancelled)
- Validacion de amount > 0
- Recalculo de estado

**Problema potencial identificado (lineas 94-102):**
```sql
-- Linea 102: status NOT IN ('sent', 'paid') puede hacer downgrade
UPDATE invoices SET status = 'sent' ...
WHERE status NOT IN ('sent', 'paid');
```

El problema es que si la factura estaba en `overdue` y llega un pago parcial, podria volver a `sent` incorrectamente si `due_date >= hoy` (caso raro pero posible si se modifica due_date).

**Regla correcta:**
- Si `total_paid >= total` -> `paid` (siempre)
- Si ya esta `overdue` -> **mantener `overdue`** hasta que pague completo
- Si `due_date < hoy` -> `overdue`
- Else -> `sent`

### Dashboard Overview (Hardcodeado)

Actualmente `DashboardOverview.tsx` tiene datos estaticos:
- "€12,450" ingresos
- "48" clientes activos
- "7" facturas pendientes
- Actividad reciente mockeada

---

## Fase 1: Refinar RPC de Pagos

### Archivo: Nueva migracion SQL

**Mejoras a implementar:**

1. **Logica de estado refinada** - No hacer downgrade desde `overdue` a `sent`
2. **Validacion de fecha futura** (opcional, warning en logs pero permitir)
3. **Mantener paid_at solo al llegar a paid** (no sobreescribir si ya existia)

```sql
-- Logica corregida:
IF _total_paid >= _invoice.total THEN
  _new_status := 'paid';
  -- Solo setear paid_at si no estaba ya pagada
  IF _invoice.status != 'paid' THEN
    UPDATE invoices SET status = 'paid', paid_at = now(), updated_at = now()
    WHERE id = _invoice_id AND business_id = _business_id;
  END IF;
ELSIF _invoice.status = 'overdue' THEN
  -- Mantener overdue hasta pago completo (no downgrade)
  _new_status := 'overdue';
ELSIF _invoice.due_date IS NOT NULL AND _invoice.due_date < CURRENT_DATE THEN
  _new_status := 'overdue';
  UPDATE invoices SET status = 'overdue', updated_at = now()
  WHERE id = _invoice_id AND business_id = _business_id;
ELSE
  _new_status := 'sent';
  UPDATE invoices SET status = 'sent', updated_at = now()
  WHERE id = _invoice_id AND business_id = _business_id
  AND status NOT IN ('sent', 'paid', 'overdue');
END IF;
```

---

## Fase 2: RPC Transaccional para Facturas

### Objetivo

Reemplazar la creacion de facturas en dos pasos (frontend) con un RPC atomico que:
1. Genera numero de factura (usando logica existente)
2. Inserta factura
3. Inserta items
4. Calcula totales en DB (source of truth)
5. Retorna invoice_id + invoice_number

### Archivo: Nueva migracion SQL

**Funcion: `create_invoice_with_items`**

```sql
CREATE OR REPLACE FUNCTION public.create_invoice_with_items(
  _business_id uuid,
  _client_id uuid,
  _due_date date DEFAULT NULL,
  _notes text DEFAULT NULL,
  _items jsonb -- Array de {product_id?, description, quantity, unit_price}
)
RETURNS TABLE(invoice_id uuid, invoice_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _invoice_number text;
  _invoice_id uuid;
  _tax_rate numeric;
  _subtotal numeric := 0;
  _tax numeric;
  _total numeric;
  _item jsonb;
  _item_total numeric;
BEGIN
  -- 1. Validar membresia
  IF NOT is_member_of_business(_business_id) THEN
    RAISE EXCEPTION 'No tienes permiso para crear facturas en este negocio';
  END IF;

  -- 2. Validar que hay items
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'La factura debe tener al menos una linea';
  END IF;

  -- 3. Obtener tax_rate del negocio (con lock para atomicidad del numero)
  SELECT tax_rate INTO _tax_rate
  FROM business_settings
  WHERE business_id = _business_id
  FOR UPDATE;

  IF _tax_rate IS NULL THEN
    _tax_rate := 16.00; -- Default
  END IF;

  -- 4. Generar numero de factura (reutilizando logica existente)
  _invoice_number := generate_invoice_number(_business_id);

  -- 5. Calcular subtotal
  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _item_total := ((_item->>'quantity')::numeric) * ((_item->>'unit_price')::numeric);
    _subtotal := _subtotal + _item_total;
  END LOOP;

  -- 6. Calcular tax y total
  _tax := _subtotal * (_tax_rate / 100);
  _total := _subtotal + _tax;

  -- 7. Insertar factura
  INSERT INTO invoices (
    business_id, client_id, invoice_number, status,
    subtotal, tax, total, due_date, notes, created_by
  ) VALUES (
    _business_id, _client_id, _invoice_number, 'draft',
    _subtotal, _tax, _total, _due_date, _notes, auth.uid()
  )
  RETURNING id INTO _invoice_id;

  -- 8. Insertar items
  INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, total)
  SELECT 
    _invoice_id,
    NULLIF(item->>'product_id', '')::uuid,
    item->>'description',
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    ((item->>'quantity')::numeric) * ((item->>'unit_price')::numeric)
  FROM jsonb_array_elements(_items) AS item;

  -- 9. Retornar resultado
  RETURN QUERY SELECT _invoice_id, _invoice_number;
END;
$$;
```

### Archivo: `src/hooks/useInvoices.ts`

**Cambios:**
- Modificar `createInvoice` para usar el nuevo RPC
- Eliminar logica de insert secuencial + rollback a cancelled
- Simplificar significativamente el codigo

```typescript
const createInvoice = async (data: CreateInvoiceData): Promise<boolean> => {
  try {
    // Convertir items a formato JSONB
    const itemsJson = data.items.map(item => ({
      product_id: item.product_id || null,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }));

    const { data: result, error } = await supabase.rpc('create_invoice_with_items', {
      _business_id: activeBusinessId,
      _client_id: data.client_id,
      _due_date: data.due_date || null,
      _notes: data.notes || null,
      _items: itemsJson,
    });

    if (error) throw error;

    toast({ title: 'Factura creada', description: `Factura ${result[0].invoice_number} creada` });
    return true;
  } catch (err) {
    toast({ title: 'Error al crear factura', variant: 'destructive' });
    return false;
  }
};
```

### Archivo: `src/pages/dashboard/invoices/NewInvoicePage.tsx`

**Cambios:**
- Eliminar generacion de numero en frontend
- El RPC devuelve el numero generado
- Simplificar estado inicial

---

## Fase 3: Metricas del Dashboard

### Objetivo

Reemplazar datos hardcodeados en `DashboardOverview.tsx` con metricas reales.

### Metricas MVP

| Metrica | Query |
|---------|-------|
| Ingresos del mes | `SUM(payments.amount)` WHERE `payment_date` en mes actual |
| Clientes activos | `COUNT(*)` FROM `clients` WHERE `is_active = true` |
| Facturas pendientes | `COUNT(*)` FROM `invoices` WHERE `status IN ('sent', 'overdue')` |
| Total pendiente | `SUM(invoices.total - COALESCE(paid, 0))` para status sent/overdue |
| Pagos recibidos (mes) | `COUNT(*)` FROM `payments` WHERE `payment_date` en mes actual |

### Archivo: `src/hooks/useDashboardMetrics.ts` (nuevo)

```typescript
interface DashboardMetrics {
  monthlyRevenue: number;
  monthlyRevenueChange: number; // vs mes anterior
  activeClients: number;
  activeClientsChange: number;
  pendingInvoices: number;
  pendingAmount: number;
  monthlyPaymentsCount: number;
  monthlyPaymentsChange: number;
  isLoading: boolean;
}

export function useDashboardMetrics(): DashboardMetrics {
  // Fetch desde payments, invoices, clients
  // Calcular comparativa vs mes anterior
}
```

### RPC Opcional: `get_dashboard_metrics`

Para eficiencia, un RPC que retorne todas las metricas en una sola llamada:

```sql
CREATE OR REPLACE FUNCTION get_dashboard_metrics(_business_id uuid)
RETURNS TABLE(
  monthly_revenue numeric,
  prev_monthly_revenue numeric,
  active_clients bigint,
  pending_invoices bigint,
  pending_amount numeric,
  monthly_payments_count bigint,
  overdue_invoices bigint,
  overdue_amount numeric
)
```

### Archivo: `src/components/dashboard/DashboardOverview.tsx`

**Cambios:**
- Importar `useDashboardMetrics`
- Reemplazar `stats` hardcodeado con datos reales
- Mantener `recentActivity` hardcodeado por ahora (siguiente iteracion: actividad real)
- Calcular `change` comparando mes actual vs anterior

---

## Archivos a Crear

| Archivo | Descripcion |
|---------|-------------|
| `supabase/migrations/xxx_refine_payment_rpc.sql` | Mejoras al RPC de pagos |
| `supabase/migrations/xxx_create_invoice_rpc.sql` | RPC transaccional de facturas |
| `supabase/migrations/xxx_dashboard_metrics_rpc.sql` | RPC de metricas (opcional) |
| `src/hooks/useDashboardMetrics.ts` | Hook para metricas del dashboard |

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/hooks/useInvoices.ts` | Usar RPC en lugar de inserts secuenciales |
| `src/pages/dashboard/invoices/NewInvoicePage.tsx` | Eliminar generacion de numero en mount |
| `src/components/dashboard/DashboardOverview.tsx` | Conectar con metricas reales |

---

## Flujo de Creacion de Factura (Despues)

```text
1. Usuario navega a /dashboard/invoices/new
   -> NO genera numero (lo hace el RPC)
   -> Carga clientes, productos, tax_rate

2. Completa formulario
   -> Agrega lineas
   -> Ve totales calculados (preview en frontend)

3. Click "Guardar"
   -> Llama RPC create_invoice_with_items
   -> RPC genera numero atomicamente
   -> RPC inserta invoice + items en transaccion
   -> RPC calcula totales en DB
   -> Retorna invoice_id + invoice_number

4. Frontend
   -> Toast con numero de factura
   -> Navega a listado
```

---

## Seguridad

1. **Ambos RPCs validan membresia** via `is_member_of_business()`
2. **SECURITY DEFINER + search_path** configurados
3. **Locks FOR UPDATE** previenen race conditions
4. **Calculos en DB** = source of truth (no confiar en frontend)
5. **Validaciones de negocio** en RPCs (no solo en frontend)

---

## Orden de Implementacion

1. Migracion: Refinar RPC de pagos (fix overdue downgrade)
2. Migracion: Crear RPC `create_invoice_with_items`
3. Actualizar `useInvoices.ts` para usar nuevo RPC
4. Actualizar `NewInvoicePage.tsx` (simplificar flujo)
5. Migracion: Crear RPC `get_dashboard_metrics` (opcional pero recomendado)
6. Crear `useDashboardMetrics.ts`
7. Actualizar `DashboardOverview.tsx` con datos reales

---

## Checklist de Validacion

### RPC de Pagos
- [ ] Pago parcial en factura `overdue` mantiene `overdue`
- [ ] Pago completo cambia a `paid` y setea `paid_at`
- [ ] `paid_at` no se sobreescribe si ya existia
- [ ] Validacion de amount > 0 funciona
- [ ] Validacion de draft/cancelled funciona

### RPC de Facturas
- [ ] Crear factura genera numero atomicamente
- [ ] Items se insertan correctamente
- [ ] Totales calculados en DB coinciden con preview
- [ ] Error en items no deja factura huerfana (transaccion completa)
- [ ] Cliente de otro negocio no puede crear facturas (RLS + validacion)

### Metricas
- [ ] Ingresos reflejan pagos del mes actual
- [ ] Clientes activos cuenta correctamente
- [ ] Facturas pendientes excluye draft/cancelled/paid
- [ ] Cambios vs mes anterior calculados correctamente

---

## Consideraciones Tecnicas

### JSONB para Items

El RPC recibe items como JSONB array:
```json
[
  {"product_id": "uuid", "description": "Servicio A", "quantity": 2, "unit_price": 100},
  {"description": "Servicio B", "quantity": 1, "unit_price": 50}
]
```

Esto permite:
- Una sola llamada RPC
- Insercion set-based de items
- Validacion en DB

### Comparativa de Meses

Para calcular "cambio vs mes anterior":
```sql
-- Mes actual
WHERE payment_date >= date_trunc('month', CURRENT_DATE)
  AND payment_date < date_trunc('month', CURRENT_DATE) + interval '1 month'

-- Mes anterior
WHERE payment_date >= date_trunc('month', CURRENT_DATE) - interval '1 month'
  AND payment_date < date_trunc('month', CURRENT_DATE)
```
