// LAS RUTAS QUE QUEDAN ABIERTAS EN LICITA (paso 2 del plan, 25-11). Se
// decide por el prefijo del controlador (`@Controller('...')`), no por la
// URL que llega: así una ruta nueva de un módulo cerrado nace cerrada, y una
// nueva de Oportunidades nace abierta.
//
// La lista mínima para una instalación que solo tiene Oportunidades:
//  - oportunidades (sus 9 controladores, también `oportunidades/mercado`);
//  - health: la salud del motor (Railway la pide);
//  - auth: recuperar y cambiar la clave (el ingreso es con Supabase);
//  - users: el perfil (`GET /users/:id` trae la empresa, sus derechos y los
//    permisos del cargo), la lista de usuarios (responsables), la clave, la
//    apariencia y la gestión de usuarios;
//  - companies: la empresa y su marca;
//  - permisos: los interruptores por cargo;
//  - storage: subir, ver (enlace firmado) y borrar archivos;
//  - licita: el alta con Google (`POST /licita/alta`, solo existe aquí).
//
// Quedan cerrados, entre otros: el cotizador, clientes, Post-venta,
// catálogo, logística, personas, marketing, consultas, facturación, BelIA,
// la guía de la casa, `plans` (entero), la Torre de Control, el portal, la
// app móvil y los robots.
//
// LA RUTA EXACTA (25-11, segunda tanda). Por encima del prefijo mandan dos
// listas cortas, por método HTTP y ruta completa (prefijo del controlador +
// ruta del método, como las escribe el código, con sus `:parametros`):
//  - CERRADAS dentro de un prefijo abierto: el alta de Eventia
//    (`POST users/signup`), que en Licita no debe existir;
//  - ABIERTAS dentro de un prefijo cerrado: lo justo del cobro (`pagos`)
//    para contratar, ver el estado, cancelar y recibir el aviso de Mercado
//    Pago. `pagos/cambiar-plan*` sigue cerrado.
// Una ruta nueva en `pagos` nace cerrada; una nueva en `users`, abierta.
//
// Módulo puro: sin Nest.

export const PREFIJOS_ABIERTOS_EN_LICITA = [
  'oportunidades',
  'health',
  'auth',
  'users',
  'companies',
  'permisos',
  'storage',
  'licita',
] as const;

export type MetodoHttp = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Una ruta del motor: método y ruta completa, sin barras de los bordes. */
export type RutaExacta = { metodo: MetodoHttp; ruta: string };

/** Cerradas en Licita aunque su prefijo esté abierto. */
export const RUTAS_CERRADAS_EN_LICITA: readonly RutaExacta[] = [
  // El alta de Eventia (contraseña, siembra de eventos y correos con su
  // marca). En Licita se entra con `POST licita/alta`.
  { metodo: 'POST', ruta: 'users/signup' },
];

/** Abiertas en Licita aunque su prefijo esté cerrado. */
export const RUTAS_ABIERTAS_EN_LICITA: readonly RutaExacta[] = [
  { metodo: 'POST', ruta: 'pagos/suscribir' },
  { metodo: 'GET', ruta: 'pagos/estado' },
  { metodo: 'POST', ruta: 'pagos/cancelar' },
  { metodo: 'POST', ruta: 'pagos/webhook' },
];

/** El prefijo como lo escribe `@Controller`: sin barras de los bordes y en
 *  minúsculas (`'/users'` y `'users'` son lo mismo). */
const limpio = (prefijo: string): string =>
  prefijo
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();

/** La ruta completa: prefijo + ruta del método, limpia y sin barras de más
 *  (`'/users'` + `'/signup'` → `users/signup`; `'pagos'` + `'/'` → `pagos`). */
export const rutaCompleta = (prefijo: string, ruta: string): string =>
  [limpio(prefijo), limpio(ruta)].filter(Boolean).join('/');

const comoLista = (v: string | string[] | undefined): string[] =>
  Array.isArray(v) ? (v.length > 0 ? v : ['']) : [v ?? ''];

/** ¿Un controlador con este prefijo queda abierto en Licita? Su primer
 *  tramo tiene que ser uno de la lista (`oportunidades/mercado` →
 *  `oportunidades`). Un controlador sin prefijo queda cerrado. */
export const abiertoEnLicita = (
  prefijo: string | string[] | undefined,
): boolean =>
  comoLista(prefijo).some((p) => {
    const primero = limpio(p).split('/')[0];
    return (PREFIJOS_ABIERTOS_EN_LICITA as readonly string[]).includes(primero);
  });

const estaEn = (
  lista: readonly RutaExacta[],
  metodo: string,
  ruta: string,
): boolean =>
  lista.some((r) => r.metodo === metodo.toUpperCase() && r.ruta === ruta);

/**
 * ¿Esta ruta exacta queda abierta en Licita? Primero las cerradas, después
 * las abiertas y al final el prefijo. `metodo` es el del decorador (`POST`);
 * sin ruta del método, solo cuenta el prefijo.
 */
export const rutaAbiertaEnLicita = (
  prefijo: string | string[] | undefined,
  rutaDelMetodo: string | string[] | undefined,
  metodo: string | undefined,
): boolean => {
  if (metodo) {
    const completas = comoLista(prefijo).flatMap((p) =>
      comoLista(rutaDelMetodo).map((r) => rutaCompleta(p, r)),
    );
    if (completas.some((c) => estaEn(RUTAS_CERRADAS_EN_LICITA, metodo, c)))
      return false;
    if (completas.some((c) => estaEn(RUTAS_ABIERTAS_EN_LICITA, metodo, c)))
      return true;
  }
  return abiertoEnLicita(prefijo);
};
