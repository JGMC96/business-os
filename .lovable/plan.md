

# Plan: Modulo de Facturas (MVP)

## Resumen

Implementacion del modulo completo de Facturas siguiendo el patron establecido en Clientes/Productos, con generacion atomica de numero de factura via RPC, gestion de lineas (invoice_items), y feature gating.

---

## Estado Actual Verificado

### Base de Datos
- **Tabla `invoices`**: Existe con campos: id, business_id, client_id, invoice_number, status, subtotal, tax, total, due_date, notes, created_by, created_at, updated_at
- **Tabla `invoice_items`**: Existe con campos: id, invoice_id, product_id (nullable), description, quantity, unit_price, total
- **Tabla `business_settings`**: Existe con tax_rate (default 16.00)
- **RPC `generate_invoice_number`**: Existe y usa FOR UPDATE locks para atomicidad
- **Enum `invoice_status`**: draft, sent, paid, overdue, cancelled

### Sidebar
- **Toast import**: Correcto, usa `import { toast } from "sonner"` (linea 19 de DashboardSidebar.tsx)
- **Ruta**: `/dashboard/invoices` ya existe como placeholder (LockedModulePage)

### Patrones Establecidos
- useClients/useProducts con requestIdRef para race conditions
- sanitizeSearchTerm para filtros seguros
- Zod + react-hook-form para validacion
- No delete real (solo status changes)

---

## Arquitectura del Modulo

```text
/dashboard/invoices
    |
    +-- Invoices.tsx (contenedor con Routes)
         |
         +-- /dashboard/invoices (InvoicesList)
         |   +-- InvoicesHeader.tsx
         |   +-- InvoicesTable.tsx
         |
         +-- /dashboard/invoices/new (NewInvoicePage)
              +-- InvoiceForm.tsx
              +-- InvoiceLineItem.tsx (componente de linea)
```

---

## Fase 1: Hook useInvoices

### Archivo: `src/hooks/useInvoices.ts`

**Responsabilidades:**
1. Fetch invoices con join a clients para mostrar nombre
2. Race condition protection con requestIdRef
3. Generar numero de factura via RPC
4. Crear factura con items (transaccion "manual")
5. Actualizar status (no delete)

**Interface:**
```typescript
interface InvoiceWithClient extends Invoice {
  client_name?: string;
}

interface InvoiceItemInput {
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
}

interface CreateInvoiceData {
  client_id: string;
  due_date?: string;
  notes?: string;
  items: InvoiceItemInput[];
}

interface UseInvoicesReturn {
  invoices: InvoiceWithClient[];
  isLoading: boolean;
  error: Error | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: InvoiceStatus | 'all';
  setStatusFilter: (status: InvoiceStatus | 'all') => void;
  fetchInvoices: () => Promise<void>;
  generateInvoiceNumber: () => Promise<string | null>;
  createInvoice: (data: CreateInvoiceData) => Promise<boolean>;
  updateInvoiceStatus: (id: string, status: InvoiceStatus) => Promise<boolean>;
  getBusinessSettings: () => Promise<{ tax_rate: number } | null>;
}
```

**Logica clave de creacion:**
```typescript
// 1. Numero ya generado en el form (se pasa como parametro o se genera al cargar /new)
// 2. Calcular totals
const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
const tax = subtotal * (taxRate / 100);
const total = subtotal + tax;

// 3. Insert invoice
const { data: invoice, error: invoiceError } = await supabase
  .from('invoices')
  .insert({
    business_id: activeBusinessId,
    client_id: data.client_id,
    invoice_number: invoiceNumber,
    status: 'draft',
    subtotal,
    tax,
    total,
    due_date: data.due_date || null,
    notes: data.notes || null,
    created_by: user.id,
  })
  .select('id')
  .single();

// 4. Insert items
const itemsToInsert = data.items.map(item => ({
  invoice_id: invoice.id,
  product_id: item.product_id || null,
  description: item.description,
  quantity: item.quantity,
  unit_price: item.unit_price,
  total: item.quantity * item.unit_price,
}));

await supabase.from('invoice_items').insert(itemsToInsert);
```

---

## Fase 2: Hook useBusinessSettings

### Archivo: `src/hooks/useBusinessSettings.ts`

**Responsabilidades:**
- Obtener tax_rate del negocio activo
- Cache simple para no re-fetch innecesario

```typescript
export function useBusinessSettings() {
  const { activeBusinessId } = useBusiness();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!activeBusinessId) return;
    
    const fetchSettings = async () => {
      const { data } = await supabase
        .from('business_settings')
        .select('*')
        .eq('business_id', activeBusinessId)
        .single();
      
      setSettings(data);
      setIsLoading(false);
    };
    
    fetchSettings();
  }, [activeBusinessId]);

  return { settings, isLoading };
}
```

---

## Fase 3: Componentes de Listado

### 3.1 InvoicesHeader.tsx

**Props:**
- searchTerm, onSearchChange
- statusFilter, onStatusFilterChange
- onNewInvoice

**UI:**
- Titulo "Facturas"
- Input de busqueda (por numero o cliente)
- Select de status (Todos, Borrador, Enviada, Pagada, Vencida, Cancelada)
- Boton "Nueva factura"

### 3.2 InvoicesTable.tsx

**Columnas:**
| Columna | Contenido |
|---------|-----------|
| Numero | invoice_number |
| Cliente | client_name (join) |
| Total | total formateado |
| Estado | Badge con color por status |
| Fecha | created_at formateado |
| Vencimiento | due_date (o "-") |
| Acciones | Menu dropdown |

**Colores de estado:**
```typescript
const statusColors: Record<InvoiceStatus, string> = {
  draft: 'secondary',
  sent: 'default',
  paid: 'success', // verde
  overdue: 'destructive', // rojo
  cancelled: 'outline',
};

const statusLabels: Record<InvoiceStatus, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  paid: 'Pagada',
  overdue: 'Vencida',
  cancelled: 'Cancelada',
};
```

**Acciones (contextuales por estado):**
- Ver detalle (futuro)
- Marcar como enviada (si draft)
- Marcar como pagada (si sent/overdue)
- Cancelar (si draft/sent)

---

## Fase 4: Formulario de Creacion

### 4.1 NewInvoicePage.tsx

**Logica al montar:**
```typescript
useEffect(() => {
  const init = async () => {
    // 1. Generar numero de factura
    const number = await generateInvoiceNumber();
    setInvoiceNumber(number);
    
    // 2. Obtener tax_rate
    const settings = await getBusinessSettings();
    setTaxRate(settings?.tax_rate ?? 16);
    
    // 3. Cargar clientes activos
    await fetchClients();
    
    // 4. Cargar productos activos (para selector)
    await fetchProducts();
  };
  init();
}, [activeBusinessId]);
```

### 4.2 InvoiceForm.tsx

**Campos:**
- **invoice_number**: Readonly, mostrado como referencia
- **client_id**: Select con clientes activos del negocio
- **due_date**: DatePicker opcional
- **notes**: Textarea opcional
- **items**: Array dinamico de lineas

**Validacion Zod:**
```typescript
const invoiceSchema = z.object({
  client_id: z.string().min(1, 'Selecciona un cliente'),
  due_date: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    product_id: z.string().optional(),
    description: z.string().min(1, 'La descripcion es requerida'),
    quantity: z.coerce.number().positive('Cantidad debe ser mayor a 0'),
    unit_price: z.coerce.number().min(0, 'Precio debe ser mayor o igual a 0'),
  })).min(1, 'Agrega al menos una linea'),
});
```

### 4.3 InvoiceLineItem.tsx

**Componente para cada linea:**
```tsx
interface LineItemProps {
  index: number;
  control: Control<FormValues>;
  products: Product[];
  onRemove: () => void;
  canRemove: boolean;
}

// UI:
// [Select Producto (opcional)] [Input Descripcion] [Input Qty] [Input Precio] [Total calculado] [X]
```

**Comportamiento:**
- Al seleccionar producto: autocompletar descripcion y precio
- Total de linea = quantity * unit_price (calculado, no editable)
- Boton X solo visible si hay mas de 1 linea

### 4.4 Calculo de Totales en Tiempo Real

```typescript
// En el form, usar watch() de react-hook-form
const items = watch('items');

const calculations = useMemo(() => {
  const subtotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    return sum + (qty * price);
  }, 0);
  
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;
  
  return { subtotal, tax, total };
}, [items, taxRate]);
```

---

## Fase 5: Paginas y Routing

### 5.1 Invoices.tsx (Contenedor)

```tsx
export default function Invoices() {
  return (
    <RequireModule module="invoicing">
      <Routes>
        <Route index element={<InvoicesList />} />
        <Route path="new" element={<NewInvoicePage />} />
        {/* Futuro: <Route path=":id" element={<InvoiceDetail />} /> */}
      </Routes>
    </RequireModule>
  );
}
```

### 5.2 Actualizar Dashboard.tsx

Cambiar el placeholder actual por el modulo real:

```tsx
// Antes:
<Route path="invoices/*" element={
  <LockedModulePage moduleName="Facturacion" moduleKey="invoicing" icon={FileText} />
} />

// Despues:
import Invoices from "@/pages/dashboard/Invoices";

<Route path="invoices/*" element={<Invoices />} />
```

---

## Archivos a Crear

| Archivo | Descripcion |
|---------|-------------|
| `src/hooks/useInvoices.ts` | Hook CRUD para facturas |
| `src/hooks/useBusinessSettings.ts` | Hook para obtener tax_rate |
| `src/pages/dashboard/Invoices.tsx` | Contenedor con subrutas |
| `src/pages/dashboard/invoices/InvoicesList.tsx` | Listado de facturas |
| `src/pages/dashboard/invoices/NewInvoicePage.tsx` | Pagina de creacion |
| `src/components/invoices/InvoicesHeader.tsx` | Header con filtros |
| `src/components/invoices/InvoicesTable.tsx` | Tabla de facturas |
| `src/components/invoices/InvoiceForm.tsx` | Formulario completo |
| `src/components/invoices/InvoiceLineItem.tsx` | Componente de linea |

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/Dashboard.tsx` | Reemplazar placeholder por modulo real |
| `src/types/database.ts` | Agregar InvoiceWithClient type si no existe |

---

## Flujo de Usuario Completo

```text
1. Usuario navega a /dashboard/invoices
   -> RequireModule valida acceso
   -> Si no tiene modulo: muestra bloqueo
   -> Si tiene: muestra InvoicesList

2. Click "Nueva factura"
   -> Navega a /dashboard/invoices/new
   -> Al montar: genera numero via RPC
   -> Carga clientes, productos, tax_rate

3. Completa formulario
   -> Selecciona cliente
   -> Agrega lineas (producto opcional)
   -> Ve totales en tiempo real

4. Click "Guardar"
   -> Validacion Zod
   -> Insert invoice + items
   -> Toast exito
   -> Navega a listado

5. En listado
   -> Ve nueva factura con status "Borrador"
   -> Puede cambiar estado via menu
```

---

## UX y Toasts

| Accion | Exito | Error |
|--------|-------|-------|
| Generar numero | - | "Error al generar numero de factura" |
| Crear factura | "Factura creada" | "Error al crear factura" |
| Cambiar estado | "Estado actualizado" | "Error al actualizar estado" |

---

## Seguridad Implementada

1. **Multi-tenant**: Todas las queries filtran por business_id
2. **RLS**: Politicas existentes validan membresia
3. **Feature gating**: RequireModule bloquea si no tiene invoicing
4. **Numero atomico**: RPC con FOR UPDATE previene duplicados
5. **Sin delete**: Solo cambios de status
6. **Validacion**: Zod valida todos los inputs
7. **created_by**: Trackea quien creo la factura

---

## Formateo de Moneda (Deuda Tecnica)

Para MVP, usar currency hardcodeada MXN:
```typescript
const formatPrice = (amount: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN', // TODO: usar activeBusiness.currency
  }).format(amount);
};
```

---

## Orden de Implementacion

1. useBusinessSettings hook (simple, necesario para tax_rate)
2. useInvoices hook (core logic)
3. InvoiceLineItem component
4. InvoiceForm component
5. NewInvoicePage
6. InvoicesHeader
7. InvoicesTable
8. InvoicesList
9. Invoices.tsx (contenedor)
10. Actualizar Dashboard.tsx

---

## Checklist de Validacion

### Funcional
- [ ] Numero de factura se genera via RPC al cargar /new
- [ ] Numero no se puede editar manualmente
- [ ] Selector de cliente carga clientes activos
- [ ] Lineas permiten seleccionar producto (autocompletado)
- [ ] Totales se calculan en tiempo real
- [ ] Guardar crea invoice + items
- [ ] Listado muestra facturas con nombre de cliente
- [ ] Filtros por status funcionan
- [ ] Cambio de status funciona

### Seguridad
- [ ] No se muestran facturas de otros negocios
- [ ] Cambio de negocio recarga datos correctamente
- [ ] Sin modulo invoicing → bloqueo correcto

### UX
- [ ] Loading states en listado y form
- [ ] Empty state con CTA
- [ ] Toasts de exito/error
- [ ] Validacion visible en campos

