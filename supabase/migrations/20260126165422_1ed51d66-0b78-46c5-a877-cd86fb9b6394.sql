-- Activar extension para busqueda "contiene"
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Indice compuesto para filtrado por estado (B-tree)
CREATE INDEX IF NOT EXISTS idx_clients_business_active 
ON public.clients(business_id, is_active);

-- Indices GIN para busqueda fuzzy con trigram
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm
ON public.clients USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_clients_email_trgm
ON public.clients USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_clients_phone_trgm
ON public.clients USING gin (phone gin_trgm_ops);