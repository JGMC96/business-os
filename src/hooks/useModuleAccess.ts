import { useBusiness } from '@/contexts/BusinessContext';
import type { ModuleKey } from '@/types/database';

export function useModuleAccess(moduleKey: ModuleKey) {
  const { enabledModules, activeBusiness } = useBusiness();
  
  const hasAccess = enabledModules.includes(moduleKey);
  const isLoading = !activeBusiness;
  
  return {
    hasAccess,
    isLoading,
    enabledModules,
  };
}
