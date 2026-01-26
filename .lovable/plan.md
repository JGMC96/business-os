
# Plan: Ajustes de Pulido al Sidebar

## Resumen

Tres correcciones preventivas antes de implementar Facturas: fix de active state por prefijo, mejor affordance para locked items, y rutas placeholder para evitar 404s internos.

---

## Problema 1: Active State por Prefijo

### Estado actual
```typescript
const isActive = location.pathname === item.path;
```
En `/dashboard/clients/123` o `/dashboard/clients/new`, el item "Clientes" aparece inactivo.

### Solucion
```typescript
const isActive = 
  item.path === "/dashboard" 
    ? location.pathname === "/dashboard"
    : location.pathname === item.path || location.pathname.startsWith(item.path + "/");
```

**Nota**: Dashboard usa igualdad exacta para no activarse en todas las subrutas.

---

## Problema 2: Affordance para Locked Items

### Estado actual
- Solo `title="Mejorar plan para acceder"` (tooltip nativo, poco visible)
- Sin click handler

### Solucion MVP
Convertir el `div` bloqueado en `button` con:
- Click que muestra toast: "Mejora tu plan para acceder a este modulo"
- Mantener `cursor-not-allowed` visual pero agregar interactividad

```typescript
import { toast } from "sonner";

// En el render de item bloqueado:
<button
  type="button"
  onClick={() => toast.info("Mejora tu plan para acceder a este módulo", {
    action: {
      label: "Ver planes",
      onClick: () => {/* futuro: navigate to pricing */}
    }
  })}
  className={cn(
    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl",
    "text-sidebar-foreground/40 hover:bg-sidebar-accent/30 transition-colors",
    !isOpen && "justify-center"
  )}
>
  ...
</button>
```

---

## Problema 3: Rutas Faltantes (404 Prevention)

### Estado actual
Routes en Dashboard.tsx:
- `/dashboard` (overview)
- `/dashboard/clients/*`
- `/dashboard/products/*`

### Links en sidebar sin ruta:
- `/dashboard/invoices` - 404
- `/dashboard/payments` - 404  
- `/dashboard/ai` - 404
- `/dashboard/settings` - 404

### Solucion
Crear componente placeholder `LockedModulePage.tsx` reutilizable:

```typescript
// src/pages/dashboard/LockedModulePage.tsx
interface Props {
  moduleName: string;
  moduleKey: ModuleKey;
  icon: LucideIcon;
}

export default function LockedModulePage({ moduleName, moduleKey, icon: Icon }: Props) {
  const { hasAccess } = useModuleAccess(moduleKey);
  
  if (hasAccess) {
    // Si tiene acceso pero no hay implementacion, mostrar "Coming Soon"
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Icon className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">{moduleName}</h2>
        <p className="text-muted-foreground">Proximamente disponible</p>
      </div>
    );
  }

  // Sin acceso: RequireModule ya maneja el bloqueo
  return <RequireModule module={moduleKey}><div /></RequireModule>;
}
```

### Agregar rutas en Dashboard.tsx
```typescript
import LockedModulePage from "@/pages/dashboard/LockedModulePage";
import { FileText, CreditCard, MessageSquare, Settings } from "lucide-react";

// En Routes:
<Route path="invoices/*" element={
  <LockedModulePage moduleName="Facturacion" moduleKey="invoicing" icon={FileText} />
} />
<Route path="payments/*" element={
  <LockedModulePage moduleName="Pagos" moduleKey="payments" icon={CreditCard} />
} />
<Route path="ai/*" element={
  <LockedModulePage moduleName="Asesor IA" moduleKey="ai_advisor" icon={MessageSquare} />
} />
<Route path="settings/*" element={
  <SettingsPlaceholder />
} />
```

### Settings Placeholder Simple
```typescript
// Inline en Dashboard.tsx o archivo separado
const SettingsPlaceholder = () => (
  <div className="flex flex-col items-center justify-center py-20">
    <Settings className="w-16 h-16 text-muted-foreground mb-4" />
    <h2 className="text-2xl font-bold mb-2">Configuracion</h2>
    <p className="text-muted-foreground">Proximamente disponible</p>
  </div>
);
```

---

## Archivos a Modificar/Crear

| Archivo | Cambios |
|---------|---------|
| `src/components/dashboard/DashboardSidebar.tsx` | Fix isActive prefijo, button con toast para locked |
| `src/pages/dashboard/LockedModulePage.tsx` | **Crear** - Placeholder reutilizable |
| `src/pages/Dashboard.tsx` | Agregar rutas placeholder para invoices/payments/ai/settings |

---

## Orden de Implementacion

1. Crear `LockedModulePage.tsx`
2. Actualizar `Dashboard.tsx` con rutas placeholder
3. Actualizar `DashboardSidebar.tsx` con fix de active + toast

---

## Resultado Final

| Escenario | Antes | Despues |
|-----------|-------|---------|
| `/dashboard/clients/123` | Clientes inactivo | Clientes activo |
| Click en item bloqueado | Nada visible | Toast con CTA |
| Navegar a `/dashboard/invoices` | 404 | Pagina locked o "coming soon" |
| Navegar a `/dashboard/settings` | 404 | Pagina "coming soon" |

---

## Checklist

- [ ] Active state funciona con subrutas
- [ ] Dashboard no se activa en subrutas (solo en `/dashboard` exacto)
- [ ] Click en locked muestra toast
- [ ] Ninguna ruta del sidebar produce 404
- [ ] Modulos sin acceso muestran RequireModule fallback
- [ ] Modulos con acceso pero sin implementar muestran "Proximamente"
