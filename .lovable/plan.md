
# Plan: Página de Configuración Completa

## Resumen

Crear una página de configuración integral con 4 secciones organizadas en tabs:
1. **Mi Perfil** - Datos personales del usuario
2. **Mi Negocio** - Información del negocio activo
3. **Mi Rol** - Visualización del rol y permisos
4. **Facturación** - Configuración de prefijos, IVA y numeración

---

## Diseño Visual

La página usará el componente `Tabs` de Radix UI con cards para cada sección, siguiendo el estilo visual existente (Inter + Plus Jakarta Sans, Deep Blue/Teal palette).

```text
┌─────────────────────────────────────────────────────────────┐
│  Configuración                                              │
├─────────────────────────────────────────────────────────────┤
│  [Mi Perfil] [Mi Negocio] [Mi Rol] [Facturación]           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Card con formulario de la sección activa           │   │
│  │                                                      │   │
│  │  [Avatar/Logo]                                       │   │
│  │  [Campos editables]                                  │   │
│  │                                                      │   │
│  │  [Guardar cambios]                                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Archivos a Crear/Modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `src/pages/dashboard/Settings.tsx` | Crear | Página principal con tabs |
| `src/components/settings/ProfileSettings.tsx` | Crear | Formulario Mi Perfil |
| `src/components/settings/BusinessSettings.tsx` | Crear | Formulario Mi Negocio |
| `src/components/settings/RoleSettings.tsx` | Crear | Vista Mi Rol |
| `src/components/settings/BillingSettings.tsx` | Crear | Formulario Facturación |
| `src/hooks/useProfileSettings.ts` | Crear | Hook para perfil de usuario |
| `src/pages/Dashboard.tsx` | Modificar | Reemplazar placeholder por Settings |

---

## Detalles por Sección

### 1. Mi Perfil (`ProfileSettings.tsx`)

**Campos editables:**
- Nombre completo (`full_name`)
- Avatar URL (`avatar_url`) - Input de texto (futuro: upload)

**Fuente de datos:** Tabla `profiles`

**Permisos:** Cualquier usuario autenticado puede editar su propio perfil

**Formulario con Zod:**
```typescript
const profileSchema = z.object({
  full_name: z.string().min(2, 'Mínimo 2 caracteres').max(100),
  avatar_url: z.string().url('URL inválida').optional().or(z.literal('')),
});
```

**Hook `useProfileSettings`:**
```typescript
interface UseProfileSettingsReturn {
  profile: { full_name: string | null; avatar_url: string | null } | null;
  isLoading: boolean;
  updateProfile: (data: ProfileFormData) => Promise<boolean>;
  isUpdating: boolean;
}
```

---

### 2. Mi Negocio (`BusinessSettings.tsx`)

**Campos editables (solo owner/admin):**
- Nombre del negocio (`name`)
- Industria (`industry`) - Select con opciones
- Moneda (`currency`) - Select (MXN, USD, EUR)
- Zona horaria (`timezone`) - Select
- Logo URL (`logo_url`) - Input texto

**Fuente de datos:** Tabla `businesses` via `activeBusiness` del contexto

**Permisos:** Solo `owner` y `admin` pueden editar (usando `useRoleAccess`)

**Formulario con Zod:**
```typescript
const businessSchema = z.object({
  name: z.string().min(2, 'Nombre requerido').max(100),
  industry: z.string().optional(),
  currency: z.enum(['MXN', 'USD', 'EUR']),
  timezone: z.string(),
  logo_url: z.string().url().optional().or(z.literal('')),
});
```

**Validación de permisos:**
```typescript
const { isAdmin } = useRoleAccess('admin');
// Si !isAdmin, mostrar campos como read-only
```

---

### 3. Mi Rol (`RoleSettings.tsx`)

**Vista informativa (no editable):**
- Badge con rol actual (Owner / Admin / Staff)
- Fecha de ingreso (`joined_at`)
- Descripción de permisos según rol

**Permisos por rol:**

| Rol | Permisos |
|-----|----------|
| Owner | Control total, eliminar negocio, gestionar suscripción |
| Admin | Gestionar miembros, configuración, eliminar registros |
| Staff | Crear/editar clientes, productos, facturas, pagos |

**Fuente de datos:** `userRole` y `activeBusiness` del contexto

---

### 4. Configuración de Facturación (`BillingSettings.tsx`)

**Campos editables (solo owner/admin):**
- Prefijo de factura (`invoice_prefix`) - ej: "FAC-"
- Próximo número (`next_invoice_number`) - read-only info
- Tasa de IVA (`tax_rate`) - número 0-100

**Fuente de datos:** Tabla `business_settings` via `useBusinessSettings`

**Formulario con Zod:**
```typescript
const billingSchema = z.object({
  invoice_prefix: z.string().max(10, 'Máximo 10 caracteres'),
  tax_rate: z.number().min(0).max(100),
});
```

**Hook actualizado `useBusinessSettings`:**
Agregar función `updateSettings(data)` para guardar cambios.

---

## Estructura de Componentes

```text
Settings.tsx
├── Header con título
└── Tabs
    ├── TabsTrigger: Mi Perfil
    ├── TabsTrigger: Mi Negocio
    ├── TabsTrigger: Mi Rol
    └── TabsTrigger: Facturación
    │
    ├── TabsContent: ProfileSettings
    │   └── Card con formulario
    ├── TabsContent: BusinessSettings
    │   └── Card con formulario (o read-only si !isAdmin)
    ├── TabsContent: RoleSettings
    │   └── Card con info de rol
    └── TabsContent: BillingSettings
        └── Card con formulario
```

---

## Integración con Dashboard.tsx

**Cambio en línea 53:**
```typescript
// Antes
<Route path="settings/*" element={<SettingsPlaceholder />} />

// Después
<Route path="settings/*" element={<Settings />} />
```

**Eliminar el componente `SettingsPlaceholder` (líneas 15-21).**

---

## Hook useProfileSettings.ts

```typescript
export function useProfileSettings() {
  const { user } = useBusiness();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch profile on mount
  useEffect(() => {
    if (!user) return;
    
    supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setProfile(data))
      .finally(() => setIsLoading(false));
  }, [user]);

  // Update profile
  const updateProfile = async (data: ProfileFormData) => {
    setIsUpdating(true);
    const { error } = await supabase
      .from('profiles')
      .update({ 
        full_name: data.full_name,
        avatar_url: data.avatar_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user?.id);
    
    setIsUpdating(false);
    if (error) {
      toast.error('Error al guardar perfil');
      return false;
    }
    toast.success('Perfil actualizado');
    return true;
  };

  return { profile, isLoading, updateProfile, isUpdating };
}
```

---

## Actualización de useBusinessSettings.ts

Agregar función `updateSettings`:

```typescript
const updateSettings = async (data: Partial<BusinessSettings>) => {
  if (!activeBusinessId) return false;
  
  const { error } = await supabase
    .from('business_settings')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('business_id', activeBusinessId);
    
  if (error) {
    toast.error('Error al guardar configuración');
    return false;
  }
  
  // Refetch
  fetchSettings();
  toast.success('Configuración guardada');
  return true;
};
```

---

## Validación de Permisos

| Sección | Quién puede ver | Quién puede editar |
|---------|-----------------|-------------------|
| Mi Perfil | Todos | El propio usuario |
| Mi Negocio | Todos | Owner, Admin |
| Mi Rol | Todos | Nadie (solo vista) |
| Facturación | Todos | Owner, Admin |

Para secciones no editables, mostrar campos con `disabled` y mensaje informativo.

---

## UI de Formularios

Cada formulario seguirá el patrón de `ClientFormDialog`:
- React Hook Form + Zod resolver
- FormField con Label, Input/Select, FormMessage
- Button de submit con estado loading
- Toast de éxito/error

---

## Ejemplo Visual: Tab "Mi Perfil"

```text
┌─────────────────────────────────────────────┐
│  Mi Perfil                                  │
│  Información personal de tu cuenta          │
├─────────────────────────────────────────────┤
│                                             │
│  [Avatar circular con inicial]              │
│                                             │
│  Email: usuario@email.com (no editable)     │
│                                             │
│  Nombre completo *                          │
│  ┌─────────────────────────────────────┐   │
│  │ Juan Pérez                           │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  URL de avatar (opcional)                   │
│  ┌─────────────────────────────────────┐   │
│  │ https://...                          │   │
│  └─────────────────────────────────────┘   │
│                                             │
│               [Guardar cambios]             │
└─────────────────────────────────────────────┘
```

---

## Consideraciones de Seguridad

- RLS existente protege `profiles` (solo el usuario puede editar su propio perfil)
- RLS existente protege `businesses` (solo owner/admin pueden UPDATE)
- RLS existente protege `business_settings` (solo owner/admin pueden UPDATE)
- El frontend valida roles con `useRoleAccess` pero la seguridad real está en RLS

---

## Archivos Finales

| Archivo | Líneas estimadas |
|---------|------------------|
| `src/pages/dashboard/Settings.tsx` | ~80 |
| `src/components/settings/ProfileSettings.tsx` | ~120 |
| `src/components/settings/BusinessSettings.tsx` | ~150 |
| `src/components/settings/RoleSettings.tsx` | ~80 |
| `src/components/settings/BillingSettings.tsx` | ~120 |
| `src/hooks/useProfileSettings.ts` | ~60 |
| `src/hooks/useBusinessSettings.ts` (modificar) | +30 |
| `src/pages/Dashboard.tsx` (modificar) | -10, +3 |

**Total: ~7 archivos, ~650 líneas de código**
