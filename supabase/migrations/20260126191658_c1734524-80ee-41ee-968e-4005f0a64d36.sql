-- 1. Insert retail module into modules catalog
INSERT INTO modules (key, name, description, display_order, is_active)
VALUES ('retail', 'Retail / POS', 'Punto de venta y control de inventario', 7, true);

-- 2. Associate retail module with Pro and Business plans
INSERT INTO plan_modules (plan_id, module_id, limits)
SELECT p.id, m.id, '{}'::jsonb
FROM plans p, modules m
WHERE p.key IN ('pro', 'business') AND m.key = 'retail';

-- 3. Add stock columns to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS stock_quantity integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS track_inventory boolean DEFAULT false;

-- 4. Create sales table
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_number text NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for sales
CREATE INDEX IF NOT EXISTS idx_sales_business_id ON sales(business_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at DESC);

-- Enable RLS on sales
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- RLS policies for sales
CREATE POLICY "Members can view sales"
  ON sales FOR SELECT
  USING (is_member_of_business(business_id));

CREATE POLICY "Members can create sales"
  ON sales FOR INSERT
  WITH CHECK (is_member_of_business(business_id));

CREATE POLICY "Owner/Admin can delete sales"
  ON sales FOR DELETE
  USING (has_min_role(business_id, 'admin'));

-- 5. Create sale_items table
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0
);

-- Enable RLS on sale_items
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for sale_items
CREATE POLICY "Members can view sale items"
  ON sale_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sales 
    WHERE sales.id = sale_items.sale_id 
    AND is_member_of_business(sales.business_id)
  ));

CREATE POLICY "Members can manage sale items"
  ON sale_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM sales 
    WHERE sales.id = sale_items.sale_id 
    AND is_member_of_business(sales.business_id)
  ));

-- 6. Create trigger function to decrement stock on sale
CREATE OR REPLACE FUNCTION decrement_stock_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products
  SET stock_quantity = stock_quantity - NEW.quantity::integer
  WHERE id = NEW.product_id 
    AND track_inventory = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_decrement_stock ON sale_items;
CREATE TRIGGER trigger_decrement_stock
AFTER INSERT ON sale_items
FOR EACH ROW EXECUTE FUNCTION decrement_stock_on_sale();

-- 7. Create function to generate sale number
CREATE OR REPLACE FUNCTION generate_sale_number(_business_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next_number integer;
  _sale_number text;
BEGIN
  IF NOT is_member_of_business(_business_id) THEN
    RAISE EXCEPTION 'No tienes permiso para generar ventas en este negocio';
  END IF;

  SELECT COALESCE(MAX(
    CASE 
      WHEN sale_number ~ '^VTA-[0-9]+$' 
      THEN SUBSTRING(sale_number FROM 5)::integer 
      ELSE 0 
    END
  ), 0) + 1
  INTO _next_number
  FROM sales
  WHERE business_id = _business_id;
  
  _sale_number := 'VTA-' || LPAD(_next_number::text, 6, '0');
  
  RETURN _sale_number;
END;
$$;