

# Plan: Normalizar amount de numeric a number en useRecentActivity

## Problema

El tipo `numeric` de PostgreSQL llega a JavaScript como **string** (no como number). Esto puede causar comportamiento inesperado en `formatPrice()` y operaciones numéricas.

**Código actual (línea 84):**
```typescript
setActivities((data as ActivityEvent[]) || []);
```

**Problema:** El cast no convierte `amount` de string a number.

---

## Solución

Agregar normalización explícita de los datos del RPC antes de asignarlos al estado.

---

## Archivo a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/hooks/useRecentActivity.ts` | Normalizar `amount` a number |

---

## Cambio Específico

**Reemplazar línea 84:**
```typescript
setActivities((data as ActivityEvent[]) || []);
```

**Por:**
```typescript
// Normalize amount from Postgres numeric (string) to JavaScript number
const rows = (data as any[] | null) ?? [];
const normalized: ActivityEvent[] = rows.map((r) => ({
  event_type: r.event_type as ActivityEventType,
  event_id: r.event_id,
  title: r.title,
  description: r.description,
  amount: r.amount === null ? null : Number(r.amount),
  created_at: r.created_at,
}));

setActivities(normalized);
```

---

## Verificación Actual

Lo que ya está correctamente implementado (no necesita cambios):

- ✅ Tipos `ActivityEvent` con `event_id` y `amount: number | null`
- ✅ `key={activity.event_id}` en el render
- ✅ `getActivityIcon(activity.event_type)` 
- ✅ `formatRelativeTime(activity.created_at)`
- ✅ Manejo de `activity.amount !== null` antes de renderizar
- ✅ Protección contra race conditions con `requestIdRef`

---

## Pruebas Recomendadas

Después del cambio:

1. **Crear cliente** → Refrescar dashboard → Aparece "Nuevo cliente" sin monto
2. **Crear factura** → Refrescar → Aparece "Factura enviada" con monto formateado correctamente
3. **Registrar pago** → Refrescar → Aparece "Pago recibido" con `+$X,XXX.XX` en verde
4. **Verificar consola** → Sin errores de tipo o NaN en formatPrice

---

## Impacto

- **Mínimo:** Solo 1 archivo, ~10 líneas de código
- **Bajo riesgo:** Normalización defensiva que previene bugs silenciosos
- **Sin cambios en SQL:** El RPC permanece igual

