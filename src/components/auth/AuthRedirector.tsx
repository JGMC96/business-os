import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Global listener that redirects authenticated users away from public
 * landing/auth pages to /dashboard or /onboarding depending on whether
 * they belong to a business. Required because the OAuth broker only
 * allows the bare origin as redirect_uri, so users land on "/" after
 * Google sign-in and need to be forwarded from there.
 */
export const AuthRedirector = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const PUBLIC_PATHS = ["/", "/auth"];

    const routeForUser = (userId: string) => {
      // Defer to avoid deadlocks inside onAuthStateChange
      setTimeout(async () => {
        if (!PUBLIC_PATHS.includes(location.pathname)) return;

        const { data: memberships } = await supabase
          .from("business_members")
          .select("business_id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .limit(1);

        if (!memberships || memberships.length === 0) {
          navigate("/onboarding", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) routeForUser(session.user.id);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) routeForUser(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [navigate, location.pathname]);

  return null;
};
