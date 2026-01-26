import { LucideIcon } from "lucide-react";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { RequireModule } from "@/components/auth/RequireModule";
import type { ModuleKey } from "@/types/database";

interface LockedModulePageProps {
  moduleName: string;
  moduleKey: ModuleKey;
  icon: LucideIcon;
}

export default function LockedModulePage({ 
  moduleName, 
  moduleKey, 
  icon: Icon 
}: LockedModulePageProps) {
  const { hasAccess } = useModuleAccess(moduleKey);
  
  if (hasAccess) {
    // Si tiene acceso pero no hay implementación, mostrar "Coming Soon"
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Icon className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">{moduleName}</h2>
        <p className="text-muted-foreground">Próximamente disponible</p>
      </div>
    );
  }

  // Sin acceso: RequireModule maneja el bloqueo
  return (
    <RequireModule module={moduleKey}>
      <div />
    </RequireModule>
  );
}
