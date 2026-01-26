import { ReactNode } from 'react';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import type { AppRole } from '@/types/database';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface RequireRoleProps {
  minRole: AppRole;
  children: ReactNode;
  fallback?: ReactNode;
  /** If true, just hide the content instead of showing an error */
  hideIfUnauthorized?: boolean;
}

const ROLE_NAMES: Record<AppRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  staff: 'Personal',
};

export function RequireRole({ 
  minRole, 
  children, 
  fallback, 
  hideIfUnauthorized = false 
}: RequireRoleProps) {
  const { hasAccess, isLoading } = useRoleAccess(minRole);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!hasAccess) {
    if (hideIfUnauthorized) return null;
    if (fallback) return <>{fallback}</>;

    return (
      <Card className="max-w-md mx-auto mt-8">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6 text-destructive" />
          </div>
          <CardTitle>Acceso restringido</CardTitle>
          <CardDescription>
            Necesitas ser <strong>{ROLE_NAMES[minRole]}</strong> o superior para acceder a esta sección.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          Contacta al propietario del negocio si necesitas acceso.
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
