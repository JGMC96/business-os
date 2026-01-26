
# Plan: Modulo de Productos (MVP)

## Resumen

Implementacion del modulo de Productos siguiendo exactamente el patron establecido por el modulo de Clientes: hook con proteccion de race conditions via requestIdRef, busqueda sanitizada, soft delete, y feature gating con RequireModule.

---

## Estado Actual Verificado

### Base de Datos
- **Tabla `products`**: Existe con campos: id, business_id, name, description, price, unit, category, is_active, created_by, created_at, updated_at
- **Indices actuales**: `products_pkey` (id), `idx_products_business` (business_id)
- **Extension `pg_trgm`**: Ya activada (v1.6)
- **Indices faltantes**: trigram para name/category, compuesto (business_id, is_active)

### Frontend
- **Patron establecido**: useClients con requestIdRef, sanitizeSearchTerm, normalizeData
- **Componentes existentes**: ClientsHeader, ClientsTable, ClientFormDialog
- **Tipo Product**: Ya definido en types/database.ts

---

## Arquitectura del Modulo

```text
/dashboard/products
    |
    +-- Products.tsx (contenedor principal)
         |
         +-- ProductsHeader.tsx (titulo, busqueda debounced, filtros)
         +-- ProductsTable.tsx (listado con acciones)
         +-- ProductFormDialog.tsx (modal crear/editar)
         |
         +-- useProducts.ts (hook CRUD)
```

---

## Fase 1: Base de Datos

### 1.1 Indices Optimizados para Productos

```sql
-- Indice compuesto para filtrado por estado
CREATE INDEX IF NOT EXISTS idx_products_business_active 
ON public.products(business_id, is_active);

-- Indices GIN para busqueda fuzzy con trigram
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
ON public.products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_category_trgm
ON public.products USING gin (category gin_trgm_ops);
```

Nota: pg_trgm ya esta activo, no necesita activarse.

---

## Fase 2: Hook de Productos

### Archivo: `src/hooks/useProducts.ts`

**Estructura identica a useClients:**

```typescript
interface ProductFormData {
  name: string;
  description?: string;
  price: number;
  unit?: string;
  category?: string;
}

interface UseProductsReturn {
  products: Product[];
  isLoading: boolean;
  error: Error | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  showInactive: boolean;
  setShowInactive: (show: boolean) => void;
  fetchProducts: () => Promise<void>;
  createProduct: (data: ProductFormData) => Promise<boolean>;
  updateProduct: (id: string, data: ProductFormData) => Promise<boolean>;
  toggleProductStatus: (id: string, currentStatus: boolean) => Promise<boolean>;
  // NO deleteProduct - solo soft delete via toggleProductStatus
}
```

**Caracteristicas clave:**

1. **requestIdRef**: Contador incremental para ignorar respuestas viejas
2. **runFetch(requestId)**: Funcion unica de fetch, usada por effect y fetchProducts
3. **sanitizeSearchTerm**: Reutiliza la misma logica que clients (reemplaza , () ; por espacios)
4. **normalizeProductData**: trim en strings, asegura price es number
5. **Query de busqueda**: `.or('name.ilike.%term%,category.ilike.%term%')`

**Normalizacion de datos:**
```typescript
function normalizeProductData(data: ProductFormData): ProductFormData {
  return {
    name: data.name.trim(),
    description: data.description?.trim() || undefined,
    price: Number(data.price),
    unit: data.unit?.trim() || undefined,
    category: data.category?.trim() || undefined,
  };
}
```

---

## Fase 3: Componentes

### 3.1 ProductsHeader.tsx

**Props:**
- searchTerm, onSearchChange
- showInactive, onShowInactiveChange
- onNewProduct

**UI:**
- Titulo "Productos" con descripcion
- Input de busqueda con debounce 300ms (identico a ClientsHeader)
- Switch "Mostrar inactivos"
- Boton "Nuevo producto"

### 3.2 ProductsTable.tsx

**Columnas:**
| Columna | Contenido |
|---------|-----------|
| Nombre | name |
| Categoria | category (o "-") |
| Precio | price formateado con currency |
| Unidad | unit (o "-") |
| Estado | Badge Activo/Inactivo |
| Acciones | Menu dropdown |

**Acciones (NO incluye Eliminar):**
- Editar
- Desactivar (si activo)
- Reactivar (si inactivo)

**Estados UI:**
- Loading: 5 skeleton rows
- Vacio: Ilustracion con icono Package + CTA
- Sin resultados: Mensaje claro

**Formateo de precio:**
```typescript
// Usar Intl.NumberFormat para moneda
const formatPrice = (price: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(price);
};
```

### 3.3 ProductFormDialog.tsx

**Campos con validacion Zod:**

| Campo | Tipo | Requerido | Validacion |
|-------|------|-----------|------------|
| name | text | Si | min 2 caracteres |
| price | number | Si | >= 0 |
| category | text | No | trim |
| unit | text | No | trim |
| description | textarea | No | trim |

**Schema Zod:**
```typescript
const productSchema = z.object({
  name: z.string()
    .min(1, 'El nombre es requerido')
    .min(2, 'El nombre debe tener al menos 2 caracteres'),
  price: z.coerce.number()
    .min(0, 'El precio debe ser mayor o igual a 0'),
  category: z.string().optional(),
  unit: z.string().optional(),
  description: z.string().optional(),
});
```

---

## Fase 4: Pagina Principal

### Archivo: `src/pages/dashboard/Products.tsx`

**Estructura identica a Clients.tsx:**

```tsx
export default function Products() {
  const {
    products,
    isLoading,
    searchTerm,
    setSearchTerm,
    showInactive,
    setShowInactive,
    createProduct,
    updateProduct,
    toggleProductStatus,
  } = useProducts();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handlers identicos al patron de Clients...

  return (
    <RequireModule module="products">
      <div className="space-y-6">
        <ProductsHeader ... />
        <ProductsTable ... />
        <ProductFormDialog ... />
      </div>
    </RequireModule>
  );
}
```

---

## Fase 5: Routing

### Modificar Dashboard.tsx

Agregar import y ruta:

```tsx
import Products from "@/pages/dashboard/Products";

// En Routes:
<Route path="products/*" element={<Products />} />
```

---

## Archivos a Crear/Modificar

### Nuevos archivos

| Archivo | Descripcion |
|---------|-------------|
| `src/hooks/useProducts.ts` | Hook CRUD con requestIdRef |
| `src/pages/dashboard/Products.tsx` | Pagina principal modulo |
| `src/components/products/ProductsHeader.tsx` | Header con busqueda debounced |
| `src/components/products/ProductsTable.tsx` | Tabla sin delete |
| `src/components/products/ProductFormDialog.tsx` | Modal con validacion Zod |
| `supabase/migrations/XXXX_products_indexes.sql` | Indices trigram y compuesto |

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/Dashboard.tsx` | Agregar ruta /products |

---

## UX y Toasts

| Accion | Exito | Error |
|--------|-------|-------|
| Crear | "Producto creado" | "Error al crear producto" |
| Editar | "Producto actualizado" | "Error al actualizar" |
| Desactivar | "Producto desactivado" | "Error al desactivar" |
| Reactivar | "Producto reactivado" | "Error al reactivar" |

---

## Seguridad Implementada

1. **Multi-tenant**: Todas las queries con `business_id = activeBusinessId`
2. **RLS**: Base de datos valida membresia via `is_member_of_business()`
3. **Feature gating**: `RequireModule module="products"` bloquea acceso
4. **Race condition**: requestIdRef previene estados inconsistentes
5. **Sin delete real**: Solo soft delete via `toggleProductStatus`
6. **Validacion**: Zod valida inputs antes de enviar
7. **created_by**: Asignado automaticamente desde `user.id`

---

## Orden de Implementacion

1. Migracion SQL (indices trigram y compuesto)
2. Hook useProducts
3. ProductFormDialog
4. ProductsTable
5. ProductsHeader
6. Products.tsx (pagina)
7. Actualizar Dashboard.tsx con ruta
8. Testing manual

---

## Checklist Post-Implementacion

### Funcional
- [ ] Listado carga por negocio activo
- [ ] No mezcla datos al cambiar de negocio (race condition)
- [ ] Busqueda "contiene" funciona en name/category
- [ ] Crear producto con validacion
- [ ] Editar producto
- [ ] Desactivar/reactivar respeta toggle "Mostrar inactivos"
- [ ] No hay boton/funcion de eliminar permanente

### Seguridad
- [ ] Queries incluyen .eq('business_id', activeBusinessId)
- [ ] Sin modulo products → bloqueo correcto por RequireModule
