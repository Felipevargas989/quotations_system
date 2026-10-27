import { useEffect } from "react";
import { toast } from "../../components/toast/Toast";
import type { MiLicitacion } from "../../services/oportunidades.service";
import { formatCurrency } from "../../utils/currencies";

// EL RESULTADO DE UNA COMPRA ÁGIL POSTULADA (decisión 92 del doc 17, 27-10).
// Felipe perdió la del catamarán (1346350-37-COT26) y Eventia no le avisó.
// Ahora el motor revisa la orden de compra en cada pasada del radar y deja
// la licitación ganada o perdida; «Mis licitaciones» dice a quién se le
// compró y por cuánto, y al abrir Oportunidades sale un aviso que queda
// hasta cerrarlo, una sola vez por resultado en este navegador.

export type ResultadoDeCompraAgil = {
  estado: "ganada" | "perdida";
  orden_de_compra: string;
  proveedor: string | null;
  rut_proveedor: string | null;
  monto: number | null;
  fecha: string | null;
};

/** Lo que trae «Mis licitaciones» desde la decisión 92. */
export type ConResultado = MiLicitacion & {
  resultado?: ResultadoDeCompraAgil | null;
};

/** «Ganaste por $X» o «Ganó X por $Y», con la orden de compra. */
export const textoDelResultado = (r: ResultadoDeCompraAgil): string => {
  const monto = r.monto ? ` por ${formatCurrency(r.monto, "CLP")}` : "";
  return r.estado === "ganada"
    ? `Ganaste${monto}, orden de compra ${r.orden_de_compra}.`
    : `Ganó ${r.proveedor ?? r.rut_proveedor ?? "otro proveedor"}${monto}, orden de compra ${r.orden_de_compra}.`;
};

const CLAVE = "eventia:resultados-avisados";
/** Lo avisado en esta sesión: sin almacenamiento no se repite el aviso en
 *  cada consulta de la lista. */
const avisadosEnEstaSesion = new Set<string>();

export const claveDelAviso = (m: ConResultado): string =>
  `${m.id}:${m.resultado?.orden_de_compra ?? ""}`;

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
      else toast.warn(texto, { sticky: true });
    }
    guardarAvisados([...avisados, ...nuevos.map(claveDelAviso)]);
  }, [lista]);
}
