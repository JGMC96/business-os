-- Create transactional RPC for creating invoices with items
-- This ensures atomicity: either everything succeeds or nothing does
-- Fixed: _items moved before parameters with defaults
CREATE OR REPLACE FUNCTION public.create_invoice_with_items(
  _business_id uuid,
  _client_id uuid,
  _items jsonb, -- Array of {product_id?, description, quantity, unit_price}
  _due_date date DEFAULT NULL,
  _notes text DEFAULT NULL
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
  -- 1. Validate membership
  IF NOT is_member_of_business(_business_id) THEN
    RAISE EXCEPTION 'No tienes permiso para crear facturas en este negocio';
  END IF;

  -- 2. Validate that there are items
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'La factura debe tener al menos una línea';
  END IF;

  -- 3. Validate client exists and belongs to the business
  IF _client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM clients 
    WHERE id = _client_id 
      AND business_id = _business_id 
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Cliente no encontrado o inactivo';
  END IF;

  -- 4. Get tax_rate from business settings (with lock for atomicity with invoice number)
  SELECT COALESCE(bs.tax_rate, 16.00) INTO _tax_rate
  FROM business_settings bs
  WHERE bs.business_id = _business_id
  FOR UPDATE;

  -- If no settings exist, use default
  IF NOT FOUND THEN
    _tax_rate := 16.00;
  END IF;

  -- 5. Generate invoice number atomically (uses existing function with its own lock)
  _invoice_number := generate_invoice_number(_business_id);

  -- 6. Calculate subtotal from items
  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _item_total := COALESCE((_item->>'quantity')::numeric, 0) * COALESCE((_item->>'unit_price')::numeric, 0);
    _subtotal := _subtotal + _item_total;
  END LOOP;

  -- 7. Calculate tax and total
  _tax := ROUND(_subtotal * (_tax_rate / 100), 2);
  _total := _subtotal + _tax;

  -- 8. Insert the invoice
  INSERT INTO invoices (
    business_id, 
    client_id, 
    invoice_number, 
    status,
    subtotal, 
    tax, 
    total, 
    due_date, 
    notes, 
    created_by
  ) VALUES (
    _business_id, 
    _client_id, 
    _invoice_number, 
    'draft',
    _subtotal, 
    _tax, 
    _total, 
    _due_date, 
    _notes, 
    auth.uid()
  )
  RETURNING id INTO _invoice_id;

  -- 9. Insert all invoice items
  INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, total)
  SELECT 
    _invoice_id,
    NULLIF(NULLIF(item->>'product_id', ''), 'null')::uuid,
    COALESCE(item->>'description', ''),
    COALESCE((item->>'quantity')::numeric, 1),
    COALESCE((item->>'unit_price')::numeric, 0),
    COALESCE((item->>'quantity')::numeric, 1) * COALESCE((item->>'unit_price')::numeric, 0)
  FROM jsonb_array_elements(_items) AS item;

  -- 10. Return the created invoice info
  RETURN QUERY SELECT _invoice_id, _invoice_number;
END;
$$;