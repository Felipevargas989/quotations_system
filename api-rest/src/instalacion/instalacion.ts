// LA INSTALACIÓN (paso 2 del plan de Licita, 25-11). El mismo motor se
// instala dos veces: Eventia (el sistema de siempre, con todo) y Licita
// (FISCOPIO), otro servidor y otra base, solo con Oportunidades, para
// empresas que no son de eventos.
//
// Una sola variable lo decide, INSTALACION: «licita» solo si lo dice; si
// falta o trae cualquier otra cosa, «eventia». Sin la variable, Eventia
// queda EXACTAMENTE igual: mismas rutas, mismos relojes, mismas
// instrucciones a la IA.
//
// Con «licita»:
//  1. el rubro de Oportunidades es «general» salvo que OPORTUNIDADES_RUBRO
//     diga otra cosa (`rubro/rubro-de-la-instalacion.ts`);
//  2. corren solo los relojes de Oportunidades (`relojes.ts`);
//  3. las rutas que no son de Oportunidades ni de la lista mínima
//     responden 404 (`portero-de-la-instalacion.guard.ts`);
//  4. lo de Oportunidades que depende del cotizador dice «no disponible en
//     esta instalación» a la persona y se salta solo cuando lo llama el
//     motor por detrás (`no-disponible.ts`).
//
// Módulo puro: sin Nest. Se lee en cada llamada, no al importar: el .env lo
// carga Nest después de los imports.

export const INSTALACIONES = ['eventia', 'licita'] as const;
export type Instalacion = (typeof INSTALACIONES)[number];

/** La instalación de este motor: `licita` solo si la variable lo dice. */
export const instalacion = (
  valor: string | undefined = process.env.INSTALACION,
): Instalacion =>
  (valor ?? '').trim().toLowerCase() === 'licita' ? 'licita' : 'eventia';

export const esLicita = (
  valor: string | undefined = process.env.INSTALACION,
): boolean => instalacion(valor) === 'licita';

/** ¿Esta instalación tiene el cotizador (cotizaciones, clientes, pagos,
 *  catálogo y Post-venta)? Solo Eventia. */
export const hayCotizador = (
  valor: string | undefined = process.env.INSTALACION,
): boolean => !esLicita(valor);
