import { useBusiness } from '@/contexts/BusinessContext';
import type { ModuleType } from '@/types/database';

export function useModuleAccess(module: ModuleType) {
  const { enabledModules, activeBusiness } = useBusiness();
  
  const hasAccess = enabledModules.includes(module);
  const isLoading = !activeBusiness;
  
  return {
    hasAccess,
    isLoading,
    enabledModules,
  };
}
