import { getClientTypeDot } from "../../utils/clientTypeColor";
import { esRecepcion } from "../../utils/recepcion";

// EL FILTRO POR TIPO DE CLIENTE DEL TABLERO (Felipe, 05-11-2026: "si yo
// quiero ver cuántas cotizaciones tengo a empresas pendientes, cuántas
// cotizaciones tengo a grupos de adultos mayores pendientes"). Una opción
// por tipo de la empresa, en su orden, con cuántas tarjetas deja en el
// tablero. Recepción ve solo los tipos particulares: son los únicos que
// trabaja, y el motor ya le manda solo esos (doc 21). Un tipo que no está
// en la lista de la empresa, o un cliente sin tipo, va al final: ninguna
// tarjeta queda fuera del filtro.

type ConTipo = { clients?: { client_type?: string | null } | null };
type TipoDeLaEmpresa = { name: string; es_particular?: boolean };
export type OpcionDeTipo = {
  value: string;
  label: string;
  cantidad: number;
  /** El punto de color: el del tipo en Clientes. */
  dotClass: string;
};

const SIN_TIPO = "__sin_tipo";

/** Como compara el motor (`normal`, en `alcance-de-recepcion.ts`). */
const claveDe = (tipo: string | null | undefined): string =>
  (tipo ?? "").trim().toLowerCase() || SIN_TIPO;

/** Las opciones: los tipos de la empresa (ya vienen en su orden), más los
 *  que aparezcan en `todas` sin estar en esa lista; cada uno con cuántas
 *  de `enElTablero` son suyas. */
export const opcionesDeTipo = (
  rol: string | null | undefined,
  tipos: readonly TipoDeLaEmpresa[],
  todas: readonly ConTipo[],
  enElTablero: readonly ConTipo[],
): OpcionDeTipo[] => {
  const recepcion = esRecepcion(rol);
  const nombres = new Map<string, string>();
  for (const t of tipos) {
    const k = claveDe(t.name);
    if (k !== SIN_TIPO && (!recepcion || t.es_particular) && !nombres.has(k))
      nombres.set(k, t.name.trim());
  }
  if (!recepcion) {
    for (const q of todas) {
      const k = claveDe(q.clients?.client_type);
      if (!nombres.has(k))
        nombres.set(
          k,
          k === SIN_TIPO ? "Sin tipo" : (q.clients?.client_type ?? "").trim(),
        );
    }
  }
  const cuantas = new Map<string, number>();
  for (const q of enElTablero) {
    const k = claveDe(q.clients?.client_type);
    cuantas.set(k, (cuantas.get(k) ?? 0) + 1);
  }
  return [...nombres].map(([value, nombre]) => ({
    value,
    label: nombre,
    cantidad: cuantas.get(value) ?? 0,
    dotClass: value === SIN_TIPO ? "bg-gray-300" : getClientTypeDot(nombre),
  }));
};

/** Sin tipos elegidos, pasan todas. */
export const coincideTipo = (
  elegidos: readonly string[],
  q: ConTipo,
): boolean =>
  elegidos.length === 0 || elegidos.includes(claveDe(q.clients?.client_type));
