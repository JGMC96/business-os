-- Índice compuesto para filtrado por estado
CREATE INDEX IF NOT EXISTS idx_products_business_active 
ON public.products(business_id, is_active);

-- Índices GIN para búsqueda fuzzy con trigram
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
ON public.products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_category_trgm
ON public.products USING gin (category gin_trgm_ops);