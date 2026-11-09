// LA PUERTA DE EVENTIA (Felipe, 09-11-2026: "cierro la pestaña, entro a
// eventi-app y tengo que volver a loguearme, pero si entro a
// www.eventi-app/dashboard no me pide nada").
//
// Medido ese día: la sesión SÍ quedaba guardada (por eso /dashboard entraba
// derecho). Lo que no miraba la sesión era la puerta: la portada mostraba
// siempre la página pública y «Acceder», siempre el formulario. Acá viven
// las dos reglas chicas de la puerta; la pieza que las usa es SiYaEntro.

/** A dónde va cada cargo al entrar: el administrador al Dashboard y los
 *  demás a Requerimientos. Es la misma regla al iniciar sesión (LoginPage)
 *  y al llegar a la puerta con la sesión ya iniciada. */
export const destinoAlEntrar = (rol: string | null | undefined): string =>
  rol === "administrador" ? "/dashboard" : "/requests";

/** ¿Este navegador guarda una sesión de Eventia? Se mira si existe la llave
 *  donde Supabase deja la sesión (`sb-<proyecto>-auth-token`), sin leerla.
 *  Es al instante: un visitante sin sesión ve la página pública sin esperar
 *  a nadie, y solo quien trae una sesión espera a que se confirme. */
export const haySesionGuardada = (
  almacen?: Pick<Storage, "length" | "key"> | null,
): boolean => {
  try {
    const donde =
      almacen === undefined
        ? typeof window === "undefined"
          ? null
          : window.localStorage
        : almacen;
    if (!donde) return false;
    for (let i = 0; i < donde.length; i++) {
      const llave = donde.key(i);
      if (llave && /^sb-.+-auth-token/.test(llave)) return true;
    }
    return false;
  } catch {
    // Un navegador que no deja leer lo guardado: como si no hubiera sesión.
    return false;
  }
};
