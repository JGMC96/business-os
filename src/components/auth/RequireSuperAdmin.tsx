import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { ShieldAlert } from 'lucide-react';

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { isSuperAdmin, isLoading } = useSuperAdmin();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <ShieldAlert className="w-12 h-12 text-destructive" />
        <h1 className="text-2xl font-semibold">Acceso restringido</h1>
        <p className="text-muted-foreground max-w-md">
          Esta área es exclusiva para administradores de la plataforma.
        </p>
        <Navigate to="/dashboard" replace />
      </div>
    );
  }

  return <>{children}</>;
}
