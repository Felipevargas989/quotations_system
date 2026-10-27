import { useEffect } from "react";
import { toast } from "../../components/toast/Toast";
import type { MiLicitacion } from "../../services/oportunidades.service";
import { formatCurrency } from "../../utils/currencies";

// EL RESULTADO DE UNA COMPRA ÁGIL POSTULADA (decisión 92 del doc 17, 27-10).
// Felipe perdió la del catamarán (1346350-37-COT26) y Eventia no le avisó.
// Ahora el motor mira la compra ágil en cada pasada del radar: cuando el
// comprador elige, compara las ofertas con el criterio de «Cómo te
// evalúan», que en una compra ágil es la ley (decisión 93): gana el menor
// precio. «Mis licitaciones» dice a quién eligieron, por cuánto y en qué
// lugar quedaste, y al abrir Oportunidades sale un aviso que queda hasta
// cerrarlo, una sola vez por resultado en este navegador.

export type ResultadoDeCompraAgil = {
  estado: "ganada" | "perdida";
  proveedor: string | null;
  rut_proveedor: string | null;
  monto: number | null;
  mi_monto: number | null;
  lugar: number | null;
  ofertas: number;
  era_la_mas_barata: boolean;
  inadmisible: string | null;
};

/** Lo que trae «Mis licitaciones» desde la decisión 92. */
export type ConResultado = MiLicitacion & {
  resultado?: ResultadoDeCompraAgil | null;
};

const pesos = (n: number) => formatCurrency(n, "CLP");

/** A quién eligieron, por cuánto y cómo quedaste tú por precio. */
export const textoDelResultado = (r: ResultadoDeCompraAgil): string => {
  const lugar =
    r.lugar !== null && r.ofertas > 1
      ? `${r.lugar}° de ${r.ofertas} por precio`
      : null;
  if (r.estado === "ganada") {
    const monto = r.mi_monto ?? r.monto;
    return `Te eligieron${monto ? ` por ${pesos(monto)}` : ""}${lugar ? `, ${lugar}` : ""}.`;
  }
  const eligieron = `Eligieron a ${r.proveedor ?? r.rut_proveedor ?? "otro proveedor"}${r.monto ? ` por ${pesos(r.monto)}` : ""}`;
  if (r.inadmisible)
    return `Tu oferta quedó fuera: ${r.inadmisible}. ${eligieron}.`;
  if (r.mi_monto === null) return `${eligieron}.`;
  if (r.era_la_mas_barata) {
    return `${eligieron}, aunque tu precio de ${pesos(r.mi_monto)} era el menor. Por ley gana el menor precio: el comprador tiene que justificarlo en la orden de compra.`;
  }
  const mas =
    r.monto !== null && r.mi_monto > r.monto
      ? `, ${pesos(r.mi_monto - r.monto)} más`
      : "";
  return `${eligieron}. Tú cotizaste ${pesos(r.mi_monto)}${mas}${lugar ? `, y quedaste ${lugar}` : ""}.`;
};

/** Verde si ganaste; rojo si tenías el menor precio y eligieron a otro. */
export const colorDelResultado = (r: ResultadoDeCompraAgil): string => {
  if (r.estado === "ganada") return "text-green-700";
  return r.era_la_mas_barata ? "text-red-700" : "text-gray-700";
};

const CLAVE = "eventia:resultados-avisados";
/** Lo avisado en esta sesión: sin almacenamiento no se repite el aviso en
 *  cada consulta de la lista. */
const avisadosEnEstaSesion = new Set<string>();

export const claveDelAviso = (m: ConResultado): string =>
  `${m.id}:${m.resultado?.estado ?? ""}:${m.resultado?.rut_proveedor ?? ""}`;

/** Los resultados que todavía no se avisaron en este navegador. */
export const resultadosNuevos = (
  lista: readonly ConResultado[],
  avisados: readonly string[],
): ConResultado[] =>
  lista.filter((m) => m.resultado && !avisados.includes(claveDelAviso(m)));

const leerAvisados = (): string[] => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
};

const guardarAvisados = (claves: string[]) => {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(claves.slice(-200)));
  } catch {
    // Sin almacenamiento, se vuelve a avisar la próxima vez: mejor eso que
    // no avisar.
  }
};

/** Al abrir Oportunidades: un aviso por cada resultado nuevo. */
export function useAvisoDeResultados(lista: readonly ConResultado[]) {
  useEffect(() => {
    const avisados = [...leerAvisados(), ...avisadosEnEstaSesion];
    const nuevos = resultadosNuevos(lista, avisados);
    if (nuevos.length === 0) return;
    nuevos.forEach((m) => avisadosEnEstaSesion.add(claveDelAviso(m)));
    for (const m of nuevos) {
      const r = m.resultado as ResultadoDeCompraAgil;
      const texto = `${r.estado === "ganada" ? "¡Ganaste" : "Perdiste"} «${m.proceso.nombre}»${r.estado === "ganada" ? "!" : "."} ${textoDelResultado(r)}`;
      if (r.estado === "ganada") toast.success(texto, { sticky: true });
      else if (r.era_la_mas_barata) toast.error(texto, { sticky: true });
      else toast.warn(texto, { sticky: true });
    }
    guardarAvisados([...avisados, ...nuevos.map(claveDelAviso)]);
  }, [lista]);
}
