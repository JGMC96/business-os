import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Detecta si el usuario autenticado es super_admin global de la plataforma.
 * Lee de la tabla `platform_roles` (separada de business_members para evitar
 * escalada de privilegios). RLS permite al usuario ver su propio registro.
 */
export function useSuperAdmin() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setIsSuperAdmin(false);
          setIsLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from('platform_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .maybeSingle();

      if (cancelled) return;
      setIsSuperAdmin(!error && !!data);
      setIsLoading(false);
    };

    check();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      check();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { isSuperAdmin, isLoading };
}
