
# Plan: Modulo de Pagos (MVP)

## Resumen

Implementacion del modulo de Pagos siguiendo los patrones establecidos en Clientes/Productos/Facturas. El objetivo principal es cerrar el ciclo del dinero: registrar pagos contra facturas y actualizar automaticamente el estado de la factura (paid cuando total pagado >= total factura).

---

## Estado Actual Verificado

### Base de Datos
- **Tabla `payments`**: Existe con campos: id, business_id, invoice_id (nullable FK), amount, payment_method, payment_date, notes, created_by, created_at, updated_at
- **RLS policies**: Ya existen para SELECT, INSERT, UPDATE (members) y DELETE (admin/owner)
- **Tabla `invoices`**: Campos relevantes: id, business_id, total, status, due_date, paid_at

### Patrones Establecidos
- `useClients`/`useInvoices`: requestIdRef para race conditions
- `sanitizeSearchTerm` para filtros seguros
- Zod + react-hook-form para validacion
- No delete real (solo soft delete/status changes)
- Dialog pattern para formularios (ClientFormDialog)

### Routing Actual
- `/dashboard/payments/*` apunta a `LockedModulePage` (placeholder)
- Sidebar ya tiene entry para "Pagos" con moduleKey "payments"

---

## Arquitectura del Modulo

```text
/dashboard/payments
    |
    +-- Payments.tsx (contenedor con RequireModule)
         |
         +-- /dashboard/payments (PaymentsList)
         |   +-- PaymentsHeader.tsx
         |   +-- PaymentsTable.tsx
         |   +-- PaymentFormDialog.tsx
```

---

## Fase 1: Hook usePayments

### Archivo: `src/hooks/usePayments.ts`

**Responsabilidades:**
1. Fetch payments con join a invoices para mostrar numero de factura
2. Race condition protection con requestIdRef
3. Crear pago y recalcular estado de factura
4. Fetch facturas disponibles para el selector

**Interface:**
```typescript
interface PaymentWithInvoice extends Payment {
  invoice_number?: string;
  invoice_total?: number;
}

interface CreatePaymentData {
  invoice_id: string;
  amount: number;
  payment_method?: string;
  payment_date: string;
  notes?: string;
}

interface UsePaymentsReturn {
  payments: PaymentWithInvoice[];
  isLoading: boolean;
  error: Error | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  fetchPayments: () => Promise<void>;
  createPayment: (data: CreatePaymentData) => Promise<boolean>;
  fetchPayableInvoices: () => Promise<InvoiceForPayment[]>;
}
```

**Logica clave de creacion + recalculo:**
```typescript
const createPayment = async (data: CreatePaymentData): Promise<boolean> => {
  // 1. Insert payment
  const { error: paymentError } = await supabase
    .from('payments')
    .insert({
      business_id: activeBusinessId,
      invoice_id: data.invoice_id,
      amount: data.amount,
      payment_method: data.payment_method || null,
      payment_date: data.payment_date,
      notes: data.notes || null,
      created_by: user.id,
    });

  if (paymentError) throw paymentError;

  // 2. Recalcular estado de la factura
  await recalculateInvoiceStatus(data.invoice_id);

  toast({ title: 'Pago registrado' });
  await fetchPayments();
  return true;
};

const recalculateInvoiceStatus = async (invoiceId: string) => {
  // Obtener total de la factura
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, total, status, due_date')
    .eq('id', invoiceId)
    .eq('business_id', activeBusinessId)
    .single();

  if (!invoice) return;

  // No tocar draft/cancelled
  if (invoice.status === 'draft' || invoice.status === 'cancelled') {
    return;
  }

  // Sumar todos los pagos de esta factura
  const { data: payments } = await supabase
    .from('payments')
    .select('amount')
    .eq('invoice_id', invoiceId)
    .eq('business_id', activeBusinessId);

  const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);

  // Determinar nuevo estado
  let newStatus: InvoiceStatus;
  const updateData: Record<string, unknown> = {};

  if (totalPaid >= invoice.total) {
    newStatus = 'paid';
    updateData.paid_at = new Date().toISOString();
  } else if (invoice.due_date && new Date(invoice.due_date) < new Date()) {
    newStatus = 'overdue';
  } else {
    newStatus = 'sent';
  }

  updateData.status = newStatus;

  await supabase
    .from('invoices')
    .update(updateData)
    .eq('id', invoiceId)
    .eq('business_id', activeBusinessId);
};
```

---

## Fase 2: Componentes UI

### 2.1 PaymentsHeader.tsx

**Props:**
- searchTerm, onSearchChange
- onNewPayment

**UI:**
- Titulo "Pagos"
- Input de busqueda (placeholder "Buscar por numero de factura...")
- Boton "Nuevo pago"

### 2.2 PaymentsTable.tsx

**Columnas:**
| Columna | Contenido |
|---------|-----------|
| Fecha | payment_date formateado |
| Factura | invoice_number (join) |
| Monto | amount formateado como moneda |
| Metodo | payment_method o "-" |
| Notas | notes truncado o "-" |
| Acciones | Ver factura (futuro) |

**Estados:**
- Loading: skeleton rows
- Empty: "Aun no hay pagos registrados" + CTA

### 2.3 PaymentFormDialog.tsx

**Form con Zod:**
```typescript
const paymentSchema = z.object({
  invoice_id: z.string().min(1, 'Selecciona una factura'),
  amount: z.coerce.number().positive('El monto debe ser mayor a 0'),
  payment_method: z.string().optional(),
  payment_date: z.string().min(1, 'La fecha es requerida'),
  notes: z.string().optional(),
});
```

**Campos:**
- **invoice_id**: Select con facturas disponibles (sent/overdue/paid)
- **amount**: Input numerico
- **payment_method**: Select opcional (Efectivo, Tarjeta, Transferencia, Otro)
- **payment_date**: Input date (default: hoy)
- **notes**: Textarea opcional

**Comportamiento:**
- Al seleccionar factura: mostrar info de la factura (total, ya pagado, pendiente)
- Validar que amount > 0

---

## Fase 3: Pagina y Routing

### 3.1 Payments.tsx (Contenedor)

```typescript
export default function Payments() {
  return (
    <RequireModule module="payments">
      <PaymentsList />
    </RequireModule>
  );
}
```

### 3.2 PaymentsList.tsx

Integra:
- PaymentsHeader
- PaymentsTable
- PaymentFormDialog

Estado:
- dialogOpen: boolean
- isSubmitting: boolean

### 3.3 Actualizar Dashboard.tsx

```typescript
// Cambiar de:
<Route path="payments/*" element={
  <LockedModulePage moduleName="Pagos" moduleKey="payments" icon={CreditCard} />
} />

// A:
import Payments from "@/pages/dashboard/Payments";

<Route path="payments/*" element={<Payments />} />
```

---

## Archivos a Crear

| Archivo | Descripcion |
|---------|-------------|
| `src/hooks/usePayments.ts` | Hook CRUD para pagos + recalculo de factura |
| `src/pages/dashboard/Payments.tsx` | Contenedor con RequireModule |
| `src/pages/dashboard/payments/PaymentsList.tsx` | Listado de pagos |
| `src/components/payments/PaymentsHeader.tsx` | Header con busqueda |
| `src/components/payments/PaymentsTable.tsx` | Tabla de pagos |
| `src/components/payments/PaymentFormDialog.tsx` | Dialog para crear pago |

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/Dashboard.tsx` | Reemplazar placeholder por modulo real |
| `src/types/database.ts` | Agregar PaymentWithInvoice y InvoiceForPayment types |

---

## Flujo de Usuario Completo

```text
1. Usuario navega a /dashboard/payments
   -> RequireModule valida acceso
   -> Si no tiene modulo: muestra bloqueo
   -> Si tiene: muestra PaymentsList

2. Click "Nuevo pago"
   -> Abre PaymentFormDialog
   -> Carga facturas disponibles (sent/overdue, opcionalmente paid para abonos)

3. Completa formulario
   -> Selecciona factura
   -> Ingresa monto
   -> Ve info de factura (total, pagado, pendiente)

4. Click "Guardar"
   -> Validacion Zod
   -> Insert payment
   -> Recalcula estado factura
   -> Toast exito
   -> Cierra dialog
   -> Refresca listado

5. En listado
   -> Ve nuevo pago con info de factura
   -> Si el pago completo la factura, esa factura ahora tiene status "paid"
```

---

## UX y Toasts

| Accion | Exito | Error |
|--------|-------|-------|
| Crear pago | "Pago registrado" | "Error al registrar pago" |
| Cargar facturas | - | "Error al cargar facturas" |

---

## Formateo de Moneda

```typescript
const formatPrice = (amount: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount);
};
```

---

## Metodos de Pago (constante)

```typescript
const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'bank', label: 'Transferencia' },
  { value: 'other', label: 'Otro' },
];
```

---

## Seguridad Implementada

1. **Multi-tenant**: Todas las queries filtran por business_id
2. **RLS**: Politicas existentes validan membresia
3. **Feature gating**: RequireModule bloquea si no tiene payments
4. **Sin delete**: No hay funcion de eliminar pagos en MVP
5. **Validacion**: Zod valida todos los inputs
6. **created_by**: Trackea quien creo el pago
7. **Estado atomico**: Recalculo de factura despues de cada pago

---

## Orden de Implementacion

1. Agregar types en database.ts
2. Crear usePayments hook
3. Crear PaymentFormDialog component
4. Crear PaymentsHeader component
5. Crear PaymentsTable component
6. Crear PaymentsList page
7. Crear Payments.tsx (contenedor)
8. Actualizar Dashboard.tsx

---

## Checklist de Validacion

### Funcional
- [ ] Puedo crear un pago sobre una factura existente
- [ ] El pago aparece en el listado
- [ ] Si el pago completa el total, la factura pasa a paid y setea paid_at
- [ ] Si no completa el total, la factura queda sent u overdue segun due_date
- [ ] No se tocan facturas draft/cancelled desde pagos
- [ ] Busqueda por numero de factura funciona

### Seguridad
- [ ] Usuario de otro negocio no ve pagos (RLS)
- [ ] Cambio de negocio recarga datos correctamente
- [ ] Sin modulo payments -> bloqueo correcto

### UX
- [ ] Loading states en listado y dialog
- [ ] Empty state con CTA
- [ ] Toasts de exito/error
- [ ] Info de factura visible al seleccionar (total/pagado/pendiente)
- [ ] Validacion visible en campos

---

## Consideraciones de Estado de Factura

La logica de recalculo NO toca:
- `draft`: Factura aun no enviada, no deberia tener pagos
- `cancelled`: Factura anulada, no deberia recibir pagos

Si una factura esta en `sent`, `overdue`, o incluso `paid` (abonos adicionales):
- Se recalcula el total pagado
- Si >= total -> `paid` + `paid_at`
- Si < total y due_date < hoy -> `overdue`
- Si < total y due_date >= hoy (o null) -> `sent`
