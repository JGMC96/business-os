

# Plan: Corrección de Métricas + Índices de Performance

## Resumen

Este plan corrige un bug crítico en las métricas del dashboard donde `pending_amount` y `overdue_amount` no descuentan pagos parciales, y añade índices para optimizar el rendimiento de las consultas.

---

## Problema Identificado

### Bug Crítico en `get_dashboard_metrics`

**Líneas 81-86 actuales:**
```sql
-- Pending amount (sum of unpaid invoice totals)
COALESCE((
  SELECT SUM(i.total)
  FROM invoices i
  WHERE i.business_id = _business_id
    AND i.status IN ('sent', 'overdue')
), 0)::numeric AS pending_amount,
```

**Problema:** Si una factura de $100 tiene $90 pagados, se cuenta como $100 pendiente en lugar de $10.

**Impacto:** El dashboard muestra montos inflados, lo cual es crítico para decisiones de negocio.

---

## Solución: Cálculo Correcto con CTE

### Nuevo SQL para `pending_amount` y `overdue_amount`

```sql
-- CTE para calcular pagos por factura
WITH invoice_payments AS (
  SELECT 
    invoice_id, 
    COALESCE(SUM(amount), 0) AS total_paid
  FROM payments
  WHERE business_id = _business_id
  GROUP BY invoice_id
)

-- Pending amount = SUM(total - paid) para sent/overdue
COALESCE((
  SELECT SUM(GREATEST(i.total - COALESCE(ip.total_paid, 0), 0))
  FROM invoices i
  LEFT JOIN invoice_payments ip ON ip.invoice_id = i.id
  WHERE i.business_id = _business_id
    AND i.status IN ('sent', 'overdue')
), 0)::numeric AS pending_amount,

-- Overdue amount = SUM(total - paid) para overdue
COALESCE((
  SELECT SUM(GREATEST(i.total - COALESCE(ip.total_paid, 0), 0))
  FROM invoices i
  LEFT JOIN invoice_payments ip ON ip.invoice_id = i.id
  WHERE i.business_id = _business_id
    AND i.status = 'overdue'
), 0)::numeric AS overdue_amount
```

---

## Fase 1: Migración SQL - Corregir RPC

### Archivo: Nueva migración

**Cambios en `get_dashboard_metrics`:**

1. Agregar CTE `invoice_payments` para pre-calcular pagos por factura
2. Modificar `pending_amount` para usar `total - paid`
3. Modificar `overdue_amount` para usar `total - paid`
4. Usar `GREATEST(..., 0)` para evitar valores negativos en caso de overpay

**Función completa corregida:**

```sql
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(_business_id uuid)
RETURNS TABLE(
  monthly_revenue numeric,
  prev_monthly_revenue numeric,
  active_clients bigint,
  prev_active_clients bigint,
  pending_invoices bigint,
  pending_amount numeric,
  monthly_payments_count bigint,
  prev_monthly_payments_count bigint,
  overdue_invoices bigint,
  overdue_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _start_of_month date;
  _start_of_prev_month date;
BEGIN
  -- Validate membership
  IF NOT is_member_of_business(_business_id) THEN
    RAISE EXCEPTION 'No tienes permiso para ver métricas de este negocio';
  END IF;

  -- Calculate date boundaries
  _start_of_month := date_trunc('month', CURRENT_DATE)::date;
  _start_of_prev_month := (_start_of_month - interval '1 month')::date;

  RETURN QUERY
  WITH invoice_payments AS (
    -- Pre-calculate total paid per invoice
    SELECT 
      p.invoice_id,
      COALESCE(SUM(p.amount), 0) AS total_paid
    FROM payments p
    WHERE p.business_id = _business_id
    GROUP BY p.invoice_id
  )
  SELECT
    -- Monthly revenue (current month payments)
    COALESCE((
      SELECT SUM(p.amount)
      FROM payments p
      WHERE p.business_id = _business_id
        AND p.payment_date >= _start_of_month
        AND p.payment_date < (_start_of_month + interval '1 month')::date
    ), 0)::numeric AS monthly_revenue,
    
    -- Previous month revenue
    COALESCE((
      SELECT SUM(p.amount)
      FROM payments p
      WHERE p.business_id = _business_id
        AND p.payment_date >= _start_of_prev_month
        AND p.payment_date < _start_of_month
    ), 0)::numeric AS prev_monthly_revenue,
    
    -- Active clients count
    (
      SELECT COUNT(*)
      FROM clients c
      WHERE c.business_id = _business_id
        AND c.is_active = true
    )::bigint AS active_clients,
    
    -- Clients created before this month (for change calculation)
    (
      SELECT COUNT(*)
      FROM clients c
      WHERE c.business_id = _business_id
        AND c.is_active = true
        AND c.created_at < _start_of_month
    )::bigint AS prev_active_clients,
    
    -- Pending invoices count (sent + overdue)
    (
      SELECT COUNT(*)
      FROM invoices i
      WHERE i.business_id = _business_id
        AND i.status IN ('sent', 'overdue')
    )::bigint AS pending_invoices,
    
    -- Pending amount (total - paid, avoiding negatives from overpay)
    COALESCE((
      SELECT SUM(GREATEST(i.total - COALESCE(ip.total_paid, 0), 0))
      FROM invoices i
      LEFT JOIN invoice_payments ip ON ip.invoice_id = i.id
      WHERE i.business_id = _business_id
        AND i.status IN ('sent', 'overdue')
    ), 0)::numeric AS pending_amount,
    
    -- Monthly payments count
    (
      SELECT COUNT(*)
      FROM payments p
      WHERE p.business_id = _business_id
        AND p.payment_date >= _start_of_month
        AND p.payment_date < (_start_of_month + interval '1 month')::date
    )::bigint AS monthly_payments_count,
    
    -- Previous month payments count
    (
      SELECT COUNT(*)
      FROM payments p
      WHERE p.business_id = _business_id
        AND p.payment_date >= _start_of_prev_month
        AND p.payment_date < _start_of_month
    )::bigint AS prev_monthly_payments_count,
    
    -- Overdue invoices count
    (
      SELECT COUNT(*)
      FROM invoices i
      WHERE i.business_id = _business_id
        AND i.status = 'overdue'
    )::bigint AS overdue_invoices,
    
    -- Overdue amount (total - paid, avoiding negatives)
    COALESCE((
      SELECT SUM(GREATEST(i.total - COALESCE(ip.total_paid, 0), 0))
      FROM invoices i
      LEFT JOIN invoice_payments ip ON ip.invoice_id = i.id
      WHERE i.business_id = _business_id
        AND i.status = 'overdue'
    ), 0)::numeric AS overdue_amount;
END;
$$;
```

---

## Fase 2: Índices de Performance

### Índices recomendados para las consultas del dashboard

```sql
-- Índice para pagos por fecha (monthly revenue queries)
CREATE INDEX IF NOT EXISTS idx_payments_business_date 
ON payments(business_id, payment_date DESC);

-- Índice para pagos por factura (pending amount calculation)
CREATE INDEX IF NOT EXISTS idx_payments_business_invoice 
ON payments(business_id, invoice_id);

-- Índice para facturas por status (pending/overdue queries)
CREATE INDEX IF NOT EXISTS idx_invoices_business_status 
ON invoices(business_id, status);

-- Índice para clientes activos
CREATE INDEX IF NOT EXISTS idx_clients_business_active 
ON clients(business_id, is_active) WHERE is_active = true;
```

---

## Archivos a Crear/Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/xxx_fix_dashboard_metrics.sql` | Corrige RPC + agrega índices |

---

## Verificación de Cambio

### Antes (Bug)
```text
Factura: $100, Pagado: $90
pending_amount = $100 (INCORRECTO)
```

### Después (Corregido)
```text
Factura: $100, Pagado: $90
pending_amount = $10 (CORRECTO)
```

---

## Checklist de Validación

- [ ] Crear factura de $100, pagar $60 → pending muestra $40
- [ ] Pagar otros $40 → pending muestra $0, factura pasa a paid
- [ ] Factura overdue de $200, pagar $50 → overdue_amount muestra $150
- [ ] Overpay: factura $100, pagar $120 → pending muestra $0 (no negativo)
- [ ] Dashboard carga sin errores
- [ ] Performance: métricas cargan en menos de 500ms

---

## Impacto

- **Corrección crítica**: Métricas financieras ahora reflejan la realidad
- **Performance**: Índices aceleran queries para negocios con muchos datos
- **Sin cambios en frontend**: El hook `useDashboardMetrics` ya funciona correctamente

