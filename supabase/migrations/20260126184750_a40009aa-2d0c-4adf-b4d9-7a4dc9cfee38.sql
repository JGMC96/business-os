-- Create RPC function to get recent activity (payments, invoices, clients)
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