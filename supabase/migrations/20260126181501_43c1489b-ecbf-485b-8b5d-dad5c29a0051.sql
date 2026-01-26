-- Create atomic RPC for payment creation + invoice recalculation
-- This prevents race conditions when multiple payments are registered concurrently

CREATE OR REPLACE FUNCTION public.create_payment_and_recalc_invoice(
  _business_id uuid,
  _invoice_id uuid,
  _amount numeric,
  _payment_method text DEFAULT NULL,
  _payment_date date DEFAULT CURRENT_DATE,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _payment_id uuid;
  _invoice invoices%ROWTYPE;
  _total_paid numeric;
  _new_status invoice_status;
BEGIN
  -- Validate membership
  IF NOT is_member_of_business(_business_id) THEN
    RAISE EXCEPTION 'No tienes permiso para registrar pagos en este negocio';
  END IF;

  -- Lock the invoice row to prevent concurrent updates
  SELECT * INTO _invoice
  FROM invoices
  WHERE id = _invoice_id
    AND business_id = _business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;

  -- Don't allow payments on draft or cancelled invoices
  IF _invoice.status IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'No se pueden registrar pagos en facturas borrador o canceladas';
  END IF;

  -- Validate amount
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;

  -- Insert the payment
  INSERT INTO payments (
    business_id,
    invoice_id,
    amount,
    payment_method,
    payment_date,
    notes,
    created_by
  ) VALUES (
    _business_id,
    _invoice_id,
    _amount,
    _payment_method,
    _payment_date,
    _notes,
    auth.uid()
  )
  RETURNING id INTO _payment_id;

  -- Calculate total paid for this invoice (including the new payment)
  SELECT COALESCE(SUM(amount), 0) INTO _total_paid
  FROM payments
  WHERE invoice_id = _invoice_id
    AND business_id = _business_id;

  -- Determine new status
  IF _total_paid >= _invoice.total THEN
    _new_status := 'paid';
    
    UPDATE invoices
    SET status = 'paid',
        paid_at = now(),
        updated_at = now()
    WHERE id = _invoice_id
      AND business_id = _business_id;
  ELSIF _invoice.due_date IS NOT NULL AND _invoice.due_date < CURRENT_DATE THEN
    _new_status := 'overdue';
    
    UPDATE invoices
    SET status = 'overdue',
        updated_at = now()
    WHERE id = _invoice_id
      AND business_id = _business_id
      AND status != 'overdue'; -- Only update if not already overdue
  ELSE
    _new_status := 'sent';
    
    UPDATE invoices
    SET status = 'sent',
        updated_at = now()
    WHERE id = _invoice_id
      AND business_id = _business_id
      AND status NOT IN ('sent', 'paid'); -- Don't downgrade from paid
  END IF;

  RETURN _payment_id;
END;
$$;