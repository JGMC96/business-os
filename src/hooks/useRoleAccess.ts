import { useBusiness } from '@/contexts/BusinessContext';
import type { AppRole } from '@/types/database';

const ROLE_HIERARCHY: Record<AppRole, number> = {
  owner: 3,
  admin: 2,
  staff: 1,
};

export function useRoleAccess(minRole: AppRole) {
  const { userRole, activeBusiness } = useBusiness();
  
  const hasAccess = userRole 
    ? ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole]
    : false;
  
  const isLoading = !activeBusiness;
  
  return {
    hasAccess,
    isLoading,
    userRole,
    isOwner: userRole === 'owner',
    isAdmin: userRole === 'admin' || userRole === 'owner',
    isStaff: userRole !== null,
  };
}
