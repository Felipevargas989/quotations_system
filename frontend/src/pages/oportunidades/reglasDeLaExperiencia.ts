import type { EstadoDeLaExperiencia } from "../../services/experiencia.service";
import type { VistaDelOferente } from "../../services/oportunidades.service";

// LA EXPERIENCIA QUE SE PRESENTA (decisión 76 del doc 17, 24-10): las
// piezas sin red, aparte del servicio (así las pruebas no tocan Supabase).

/** Los clientes de este tipo se muestran solos; los particulares, nunca. */
export const TIPO_PUBLICO = "Empresas Publicas";
export const TIPO_PARTICULAR = "Particulares";

export const claveDeLaExperiencia = (id: number) =>
  ["oportunidades", "experiencia", id] as const;

/** ¿Falta confirmar? Si las bases piden experiencia y todavía no hay una
 *  confirmada, no se arma (el motor también lo corta). */
export const faltaConfirmarExperiencia = (
  e: EstadoDeLaExperiencia | undefined,
): boolean =>
  Boolean(e?.piden) &&
  !(e?.trabajo?.estado === "listo" && e.trabajo.resultado?.confirmada);

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
