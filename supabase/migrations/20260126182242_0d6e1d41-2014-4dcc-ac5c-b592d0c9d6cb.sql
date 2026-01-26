-- Create RPC for dashboard metrics
-- Returns all key metrics for the business dashboard in a single call
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
  _start_of_two_months_ago date;
BEGIN
  -- Validate membership
  IF NOT is_member_of_business(_business_id) THEN
    RAISE EXCEPTION 'No tienes permiso para ver métricas de este negocio';
  END IF;

  -- Calculate date boundaries
  _start_of_month := date_trunc('month', CURRENT_DATE)::date;
  _start_of_prev_month := (_start_of_month - interval '1 month')::date;
  _start_of_two_months_ago := (_start_of_month - interval '2 months')::date;

  RETURN QUERY
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
    
    -- Clients created previous month (for change calculation)
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
    
    -- Pending amount (sum of unpaid invoice totals)
    COALESCE((
      SELECT SUM(i.total)
      FROM invoices i
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
    
    -- Overdue amount
    COALESCE((
      SELECT SUM(i.total)
      FROM invoices i
      WHERE i.business_id = _business_id
        AND i.status = 'overdue'
    ), 0)::numeric AS overdue_amount;
END;
$$;