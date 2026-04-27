import { supabase } from "@/integrations/supabase/client";

/**
 * Comprueba si un usuario es super_admin global de la plataforma.
 * Lee de `platform_roles`. RLS permite al usuario ver su propio registro.
 */
export async function checkIsSuperAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("platform_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();

  return !error && !!data;
}
