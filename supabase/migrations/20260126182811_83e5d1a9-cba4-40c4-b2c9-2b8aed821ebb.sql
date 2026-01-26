-- Fix dashboard metrics to properly calculate pending amounts by subtracting partial payments
-- Also add performance indexes for dashboard queries

-- Corrected RPC that uses CTE to calculate paid amounts per invoice
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

-- Performance indexes for dashboard queries

-- Index for payments by date (monthly revenue queries)
CREATE INDEX IF NOT EXISTS idx_payments_business_date 
ON payments(business_id, payment_date DESC);

-- Index for payments by invoice (pending amount calculation)
CREATE INDEX IF NOT EXISTS idx_payments_business_invoice 
ON payments(business_id, invoice_id);

-- Index for invoices by status (pending/overdue queries)
CREATE INDEX IF NOT EXISTS idx_invoices_business_status 
ON invoices(business_id, status);

-- Partial index for active clients only
CREATE INDEX IF NOT EXISTS idx_clients_business_active 
ON clients(business_id, is_active) WHERE is_active = true;