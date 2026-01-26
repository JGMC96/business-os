
# Plan: Navegación Inteligente en Sidebar

## Resumen

Actualizar el DashboardSidebar para mostrar navegación con feature gating: items de módulos habilitados son navegables, módulos no habilitados aparecen bloqueados con candado y CTA de "Mejorar plan".

---

## Estado Actual

### Sidebar actual
- Menu items definidos estáticamente sin `moduleKey`
- Todos los items son Links navegables (incluso módulos no implementados)
- Business selector muestra datos hardcodeados ("Mi Negocio", "Plan Pro")

### Recursos disponibles
- `useBusiness()` provee `enabledModules`, `activeBusiness`
- `ModuleKey`: `'clients' | 'products' | 'invoicing' | 'payments' | 'ai_advisor' | 'reports'`
- Icono `Lock` de lucide-react para items bloqueados

---

## Arquitectura de la Solución

```text
menuItems[]
    |
    +-- { icon, label, path }                    → Siempre visible (Dashboard, Settings)
    +-- { icon, label, path, moduleKey }         → Requiere módulo habilitado
         |
         +-- moduleKey in enabledModules? → Link normal
         +-- moduleKey NOT in enabledModules? → Item bloqueado + Lock + tooltip
```

---

## Cambios en DashboardSidebar.tsx

### 1. Importar contexto y agregar Lock icon

```typescript
import { useBusiness } from "@/contexts/BusinessContext";
import { Lock } from "lucide-react";
import type { ModuleKey } from "@/types/database";
```

### 2. Actualizar estructura de menuItems

```typescript
interface MenuItem {
  icon: LucideIcon;
  label: string;
  path: string;
  moduleKey?: ModuleKey; // undefined = siempre visible
}

const menuItems: MenuItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Users, label: "Clientes", path: "/dashboard/clients", moduleKey: "clients" },
  { icon: Package, label: "Productos", path: "/dashboard/products", moduleKey: "products" },
  { icon: FileText, label: "Facturas", path: "/dashboard/invoices", moduleKey: "invoicing" },
  { icon: CreditCard, label: "Pagos", path: "/dashboard/payments", moduleKey: "payments" },
  { icon: MessageSquare, label: "Asesor IA", path: "/dashboard/ai", moduleKey: "ai_advisor" },
];
```

### 3. Lógica de renderizado condicional

```typescript
const { enabledModules, activeBusiness } = useBusiness();

// Para cada item:
const isModuleEnabled = !item.moduleKey || enabledModules.includes(item.moduleKey);
const isLocked = item.moduleKey && !isModuleEnabled;
```

### 4. Renderizado de items

**Módulo habilitado:** Link normal con hover y active states

**Módulo bloqueado:**
- `div` en lugar de `Link` (no navegable)
- Opacidad reducida (opacity-50)
- Cursor not-allowed
- Icono de Lock pequeño junto al label
- Tooltip con "Mejorar plan" (cuando sidebar está expandido)

```tsx
{isLocked ? (
  <div
    className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-xl",
      "text-sidebar-foreground/40 cursor-not-allowed",
      !isOpen && "justify-center"
    )}
    title="Mejorar plan para acceder"
  >
    <item.icon className="w-5 h-5 flex-shrink-0" />
    {isOpen && (
      <div className="flex items-center gap-2 flex-1">
        <span className="text-sm font-medium">{item.label}</span>
        <Lock className="w-3.5 h-3.5 text-sidebar-foreground/40" />
      </div>
    )}
  </div>
) : (
  <Link ... /> // Código actual
)}
```

### 5. Business selector con datos reales

Actualmente hardcodeado, cambiar a:

```tsx
{isOpen && (
  <div className="flex-1 text-left">
    <p className="text-sm font-medium truncate">
      {activeBusiness?.name || "Sin negocio"}
    </p>
    <p className="text-xs text-sidebar-foreground/60">
      {/* TODO: Mostrar plan cuando tengamos subscription */}
      Negocio activo
    </p>
  </div>
)}
```

---

## UI States

| Estado | Apariencia |
|--------|------------|
| Habilitado + inactivo | Opacidad normal, hover bg |
| Habilitado + activo | Fondo primario, texto contraste |
| Bloqueado | Opacidad 40%, candado, no clickeable |
| Sidebar colapsado + bloqueado | Solo icono con opacidad reducida |

---

## Detalles Técnicos

### Colores y estilos

```typescript
// Item bloqueado
"text-sidebar-foreground/40 cursor-not-allowed"

// Candado
"w-3.5 h-3.5 text-sidebar-foreground/40"
```

### Tooltip para bloqueados (opcional MVP+)

Usar `title` attribute como MVP:
```tsx
title="Mejorar plan para acceder"
```

En el futuro, podría usarse el componente Tooltip de shadcn para mejor UX.

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/components/dashboard/DashboardSidebar.tsx` | Agregar moduleKey a items, lógica de bloqueo, datos reales del negocio |

---

## Código Final Esperado (Estructura)

```tsx
export const DashboardSidebar = ({ isOpen, onToggle }: DashboardSidebarProps) => {
  const location = useLocation();
  const { enabledModules, activeBusiness } = useBusiness();

  return (
    <motion.aside ...>
      {/* Logo section - sin cambios */}
      
      {/* Business selector - con datos reales */}
      <div className="p-4 border-b border-sidebar-border">
        <button ...>
          ...
          {isOpen && (
            <div className="flex-1 text-left">
              <p className="text-sm font-medium truncate">
                {activeBusiness?.name || "Sin negocio"}
              </p>
              <p className="text-xs text-sidebar-foreground/60">
                Negocio activo
              </p>
            </div>
          )}
        </button>
      </div>

      {/* Navigation - con gating */}
      <nav ...>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          const isModuleEnabled = !item.moduleKey || enabledModules.includes(item.moduleKey);

          if (!isModuleEnabled) {
            return (
              <div key={item.path} className="... locked styles" title="Mejorar plan">
                <item.icon />
                {isOpen && (
                  <div className="flex items-center gap-2 flex-1">
                    <span>{item.label}</span>
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link key={item.path} ...>
              // Código actual para items habilitados
            </Link>
          );
        })}
      </nav>

      {/* Settings & collapse - sin cambios */}
    </motion.aside>
  );
};
```

---

## Checklist de Validación

### Visual
- [ ] Dashboard siempre visible (no tiene moduleKey)
- [ ] Clientes/Productos muestran normal si están habilitados
- [ ] Facturas/Pagos/Asesor IA aparecen bloqueados si no están habilitados
- [ ] Items bloqueados tienen candado visible
- [ ] Items bloqueados no son clickeables

### Funcional
- [ ] Click en item habilitado navega correctamente
- [ ] Click en item bloqueado no hace nada
- [ ] Nombre del negocio se muestra correctamente
- [ ] Cambio de negocio actualiza módulos habilitados

### Responsivo
- [ ] Sidebar colapsado muestra iconos con opacidad correcta
- [ ] No hay overflow de texto en nombres largos
