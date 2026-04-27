/**
 * Persistencia opcional de sesión ("Recordar sesión").
 *
 * El cliente de Supabase está configurado para usar localStorage (no podemos
 * editarlo). Para soportar un modo "no recordar":
 *
 *  - Al iniciar sesión, si el usuario NO marcó "recordar", guardamos el flag
 *    `tb_remember = 'false'` en localStorage.
 *  - Antes de cerrar la pestaña (`pagehide`), movemos el token de auth desde
 *    localStorage a sessionStorage. Así, al cerrar la pestaña/navegador, el
 *    sessionStorage se limpia y el usuario debe volver a iniciar sesión.
 *  - Al abrir la app, si encontramos un token en sessionStorage, lo restauramos
 *    a localStorage ANTES de que el cliente de Supabase lo lea, para que la
 *    sesión siga viva durante recargas dentro de la misma pestaña.
 */

const REMEMBER_KEY = "tb_remember";

const getAuthStorageKey = (): string | null => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) return k;
  }
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) return k;
  }
  return null;
};

export const setRememberSession = (remember: boolean) => {
  if (remember) {
    localStorage.removeItem(REMEMBER_KEY);
  } else {
    localStorage.setItem(REMEMBER_KEY, "false");
  }
};

export const isRememberSession = (): boolean => {
  return localStorage.getItem(REMEMBER_KEY) !== "false";
};

/**
 * Llamar UNA vez antes de inicializar la app (en main.tsx) para restaurar
 * el token desde sessionStorage si veníamos de un modo "no recordar".
 */
export const bootstrapSessionPersistence = () => {
  try {
    // 1. Restaurar desde sessionStorage si existe (recarga de página en modo no-recordar)
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const value = sessionStorage.getItem(k);
        if (value && !localStorage.getItem(k)) {
          localStorage.setItem(k, value);
        }
      }
    }

    // 2. Antes de cerrar la pestaña, si el modo es "no recordar", mover el
    //    token de localStorage a sessionStorage para que muera con la pestaña.
    const handlePageHide = () => {
      if (isRememberSession()) return;
      const key = getAuthStorageKey();
      if (!key) return;
      const value = localStorage.getItem(key);
      if (value) {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    };

    window.addEventListener("pagehide", handlePageHide);
  } catch (err) {
    console.error("[sessionPersistence] bootstrap error:", err);
  }
};
