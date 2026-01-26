
# Plan: Implementar Módulo Retail Completo

## Resumen

Crear un módulo de **Retail/Punto de Venta** que permita registrar ventas rápidas, gestionar inventario básico y ver tickets de venta. El módulo será exclusivo para planes **Pro** y **Business**.

---

## Arquitectura del Sistema Actual

El sistema ya tiene una arquitectura modular robusta:

```text
modules (catálogo)
    ↓
plan_modules (qué módulos incluye cada plan)
    ↓
business_modules (qué módulos tiene habilitado cada negocio)
    ↓
enabledModules[] (contexto React para UI gating)
```

---

## Fases de Implementación

### Fase 1: Backend (Base de Datos)

| Cambio | Descripción |
|--------|-------------|
| Insertar módulo `retail` | En tabla `modules` |
| Asociar a planes Pro/Business | En tabla `plan_modules` |
| Agregar `stock_quantity` a `products` | Para control de inventario |
| Crear tabla `sales` | Ventas/tickets de POS |
| Crear tabla `sale_items` | Líneas de cada venta |
| Crear RLS policies | Seguridad multi-tenant |

### Fase 2: Frontend (Tipos y Contexto)

| Archivo | Cambio |
|---------|--------|
| `src/types/database.ts` | Agregar `retail` a `ModuleKey` |
| `src/components/auth/RequireModule.tsx` | Agregar nombre "Retail" al mapa |

### Fase 3: UI del Módulo

| Archivo | Descripción |
|---------|-------------|
| `src/pages/dashboard/Retail.tsx` | Página principal con tabs |
| `src/components/retail/POSPanel.tsx` | Panel de venta rápida (cart) |
| `src/components/retail/SalesHistory.tsx` | Historial de ventas |
| `src/components/retail/InventoryView.tsx` | Vista de stock |
| `src/hooks/useRetailSales.ts` | Hook para CRUD de ventas |
| `src/hooks/useInventory.ts` | Hook para stock de productos |

### Fase 4: Integración

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/DashboardSidebar.tsx` | Agregar item "Retail" |
| `src/pages/Dashboard.tsx` | Agregar ruta `/retail/*` |

---

## Detalle: Migración de Base de Datos

### 1. Insertar módulo retail

```sql
INSERT INTO modules (key, name, description, display_order, is_active)
VALUES ('retail', 'Retail / POS', 'Punto de venta y control de inventario', 7, true);
```

### 2. Asociar a planes Pro y Business

```sql
-- Obtener IDs dinámicamente
INSERT INTO plan_modules (plan_id, module_id, limits)
SELECT p.id, m.id, '{}'::jsonb
FROM plans p, modules m
WHERE p.key IN ('pro', 'business') AND m.key = 'retail';
```

### 3. Agregar stock a products

```sql
ALTER TABLE products 
ADD COLUMN stock_quantity integer DEFAULT 0,
ADD COLUMN track_inventory boolean DEFAULT false;
```

### 4. Crear tabla sales

```sql
CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_number text NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_sales_business_id ON sales(business_id);
CREATE INDEX idx_sales_created_at ON sales(created_at DESC);

-- RLS
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view sales"
  ON sales FOR SELECT
  USING (is_member_of_business(business_id));

CREATE POLICY "Members can create sales"
  ON sales FOR INSERT
  WITH CHECK (is_member_of_business(business_id));

CREATE POLICY "Owner/Admin can delete sales"
  ON sales FOR DELETE
  USING (has_min_role(business_id, 'admin'));
```

### 5. Crear tabla sale_items

```sql
CREATE TABLE sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0
);

-- RLS (hereda de sales)
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

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
```

### 6. Trigger para decrementar stock (opcional pero recomendado)

```sql
CREATE OR REPLACE FUNCTION decrement_stock_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products
  SET stock_quantity = stock_quantity - NEW.quantity
  WHERE id = NEW.product_id 
    AND track_inventory = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_decrement_stock
AFTER INSERT ON sale_items
FOR EACH ROW EXECUTE FUNCTION decrement_stock_on_sale();
```

---

## Detalle: Tipos TypeScript

### Actualizar `ModuleKey`

```typescript
export type ModuleKey = 
  | 'clients' 
  | 'products' 
  | 'invoicing' 
  | 'payments' 
  | 'ai_advisor' 
  | 'reports'
  | 'retail';  // NUEVO
```

### Nuevas interfaces

```typescript
export interface Sale {
  id: string;
  business_id: string;
  sale_number: string;
  client_id: string | null;
  subtotal: number;
  tax: number;
  total: number;
  payment_method: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface SaleWithItems extends Sale {
  items: SaleItem[];
  client_name?: string;
}

export interface ProductWithStock extends Product {
  stock_quantity: number;
  track_inventory: boolean;
}
```

---

## Detalle: UI del Módulo Retail

### Estructura de Retail.tsx

```text
┌─────────────────────────────────────────────────────────────┐
│  Retail / Punto de Venta                                    │
├─────────────────────────────────────────────────────────────┤
│  [Nueva Venta] [Historial] [Inventario]                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Tab: Nueva Venta                                           │
│  ┌──────────────────────┐  ┌──────────────────────────┐    │
│  │ Buscar producto...   │  │ Carrito                  │    │
│  ├──────────────────────┤  ├──────────────────────────┤    │
│  │ [Producto 1] $100    │  │ Producto A  x2   $200   │    │
│  │ [Producto 2] $250    │  │ Producto B  x1   $250   │    │
│  │ [Producto 3] $75     │  │                          │    │
│  │ ...                  │  │ Subtotal:        $450   │    │
│  │                      │  │ IVA (16%):       $72    │    │
│  │                      │  │ ─────────────────────── │    │
│  │                      │  │ TOTAL:           $522   │    │
│  │                      │  │                          │    │
│  │                      │  │ [Efectivo] [Tarjeta]    │    │
│  │                      │  │ [Cobrar $522]            │    │
│  └──────────────────────┘  └──────────────────────────┘    │
│                                                             │
│  Tab: Historial                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ # Venta    │ Fecha       │ Cliente  │ Total │ Método │  │
│  │ VTA-0001   │ Hace 5 min  │ Mostrador│ $522  │ Efect. │  │
│  │ VTA-0002   │ Hoy 10:30   │ Juan P.  │ $1200 │ Tarjeta│  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Tab: Inventario                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Producto    │ Precio  │ Stock │ Tracking │ Acciones  │  │
│  │ Producto A  │ $100    │ 50    │ ✓        │ [Ajustar] │  │
│  │ Producto B  │ $250    │ 12    │ ✓        │ [Ajustar] │  │
│  │ Servicio X  │ $500    │ -     │ ✗        │ -         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Detalle: Sidebar y Rutas

### DashboardSidebar.tsx

Agregar al array `menuItems`:

```typescript
{ 
  icon: ShoppingCart, 
  label: "Retail", 
  path: "/dashboard/retail", 
  moduleKey: "retail" 
}
```

### Dashboard.tsx

Agregar ruta:

```tsx
<Route path="retail/*" element={<Retail />} />
```

---

## Archivos a Crear/Modificar

| Archivo | Acción | Líneas Est. |
|---------|--------|-------------|
| Migración SQL | Ejecutar | ~80 SQL |
| `src/types/database.ts` | Modificar | +40 |
| `src/components/auth/RequireModule.tsx` | Modificar | +1 |
| `src/components/dashboard/DashboardSidebar.tsx` | Modificar | +2 |
| `src/pages/Dashboard.tsx` | Modificar | +2 |
| `src/pages/dashboard/Retail.tsx` | Crear | ~100 |
| `src/components/retail/POSPanel.tsx` | Crear | ~250 |
| `src/components/retail/SalesHistory.tsx` | Crear | ~120 |
| `src/components/retail/InventoryView.tsx` | Crear | ~150 |
| `src/hooks/useRetailSales.ts` | Crear | ~100 |
| `src/hooks/useInventory.ts` | Crear | ~80 |

**Total estimado: ~12 archivos, ~900 líneas**

---

## Flujo de Venta (POS)

1. Usuario abre **Nueva Venta**
2. Busca/selecciona productos → se agregan al carrito
3. Ajusta cantidades si es necesario
4. Selecciona método de pago (Efectivo/Tarjeta/Transferencia)
5. Click en **Cobrar**
6. Sistema:
   - Crea registro en `sales`
   - Crea registros en `sale_items`
   - Trigger decrementa `stock_quantity` (si `track_inventory = true`)
7. Muestra ticket/confirmación
8. Venta aparece en Historial

---

## Consideraciones de Seguridad

- RLS en `sales` y `sale_items` usa `is_member_of_business()`
- Solo Owner/Admin pueden eliminar ventas
- El trigger de stock usa `SECURITY DEFINER` para bypass seguro
- Módulo solo visible si `retail` está en `enabledModules`

---

## Orden de Ejecución

1. **Migración SQL** (módulo + tablas + RLS)
2. **Tipos TypeScript** (ModuleKey + interfaces)
3. **Hooks** (useRetailSales, useInventory)
4. **Componentes** (POSPanel, SalesHistory, InventoryView)
5. **Página Retail.tsx**
6. **Integración** (Sidebar + Dashboard routes)
7. **Pruebas** (crear venta, verificar stock, ver historial)
