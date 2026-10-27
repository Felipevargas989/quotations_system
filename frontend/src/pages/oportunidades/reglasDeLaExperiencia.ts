import type { EstadoDeLaExperiencia } from "../../services/experiencia.service";
import type { VistaDelOferente } from "../../services/oportunidades.service";

// LA EXPERIENCIA QUE SE PRESENTA (decisión 76 del doc 17, 24-10): las
// piezas sin red, aparte del servicio (así las pruebas no tocan Supabase).

/** Los clientes de este tipo se muestran solos; los particulares, nunca. */
export const TIPO_PUBLICO = "Empresas Publicas";
export const TIPO_PARTICULAR = "Particulares";

export const claveDeLaExperiencia = (id: number) =>
  ["oportunidades", "experiencia", id] as const;

/** El aviso de «Armar postulación» (decisión 86, 27-10): la IA elige la
 *  experiencia al armar y solo se avisa si no alcanza para el puntaje
 *  máximo o si no se pudo elegir. Sin nada que decir, null. */
export const avisoDeExperiencia = (
  e: EstadoDeLaExperiencia | undefined,
): string | null => {
  if (!e?.piden || !e.trabajo) return null;
  if (e.trabajo.estado === "error") {
    const motivo = e.trabajo.error
      ? `: ${e.trabajo.error.replace(/\.?\s*$/, ".")}`
      : ".";
    return `No se pudo elegir la experiencia${motivo} Vuelve a armar.`;
  }
  const r = e.trabajo.estado === "listo" ? e.trabajo.resultado : null;
  if (!r) return null;
  const con = r.elegidas.filter((c) => c.con_respaldo).length;
  const subir =
    "Sube órdenes de compra a «Mi empresa» o las facturas de tus eventos en Post-venta, y vuelve a armar.";
  if (r.pide > 0 && con < r.pide) {
    return `La IA encontró ${con} ${con === 1 ? "contrato" : "contratos"} con respaldo y las bases dan el puntaje máximo con ${r.pide}. ${subir}`;
  }
  if (con === 0) return `La IA no encontró experiencia con respaldo. ${subir}`;
  return null;
};

/** Los clientes privados que se pueden mostrar, de «Mi empresa». */
export const clientesQueSeMuestran = (
  vista: VistaDelOferente | undefined,
): string[] => {
  const lista = (
    vista?.oferente as { clientes_que_se_muestran?: unknown } | undefined
  )?.clientes_que_se_muestran;
  return Array.isArray(lista)
    ? lista.filter((x): x is string => typeof x === "string")
    : [];
};
