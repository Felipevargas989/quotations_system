// ¿ESTE SERVICIO ESTÁ EN ALGUNA COTIZACIÓN? (13-08-2026)
//
// Las cotizaciones guardan bajo "codigo" dos cosas distintas: las
// nuevas anotan el ID del servicio ("2042") y las viejas anotaron el
// código del catálogo ("SF008"). La pantalla preguntaba SOLO por el
// código, así que un servicio usado en 28 cotizaciones mostraba la
// papelera encendida (pillada de Felipe con "Bollería variedades",
// que tiene id 2042 y código 10: nunca calzaban).
//
// El servidor mira las mismas dos llaves (services.repository.ts):
// acá solo se refleja, no se decide.
export const servicioEnUso = (
  usados: ReadonlySet<string>,
  servicio: { id: number; code?: string | null },
): boolean =>
  usados.has(String(servicio.id)) ||
  usados.has(String(servicio.code || "").trim());
