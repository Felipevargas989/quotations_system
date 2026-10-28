import type {
  Generacion,
  GeneracionesDeOportunidad,
} from "../../services/oportunidades.service";
import type { TrabajoDeOferta } from "../../services/postulacion.service";

// «ARMAR POSTULACIÓN» (decisión 35 del doc 17, 19-10): en qué va cada paso
// de la última vuelta. Un documento es de esta vuelta si se pidió después
// de que quedó lista la oferta; los de antes son de otra. Lo que no
// alcanzó a partir lo anota el motor en la fila de la oferta.

/** La misma consulta en «Armar postulación», «Qué ofreces» y la cotización. */
export const claveDeLaOferta = (oportunidadId: number) => [
  "oportunidades",
  "oferta",
  oportunidadId,
];

export type EstadoDelPaso =
  | "espera"
  | "trabajando"
  | "listo"
  | "error"
  | "no_va"
  | "firmados";

export interface Paso {
  estado: EstadoDelPaso;
  generacion: Generacion | null;
  problema: string | null;
}

export interface Vuelta {
  total: number;
  oferta: Exclude<EstadoDelPaso, "espera" | "no_va" | "firmados">;
  anexos: Paso;
  propuesta: Paso;
  /** Lo demás que no se pudo (la cotización vinculada), en palabras. */
  avisos: string[];
  /** Algo sigue andando: no se vuelve a armar encima. */
  enCurso: boolean;
}

/** Si a los 3 minutos de lista la oferta un documento no aparece, no
 *  partió: se puede reintentar. */
const PLAZO_PARA_PARTIR_MS = 3 * 60 * 1000;

const NO_VA: Paso = { estado: "no_va", generacion: null, problema: null };
const FIRMADOS: Paso = { estado: "firmados", generacion: null, problema: null };

function pasoDe(
  oferta: TrabajoDeOferta,
  g: Generacion | null | undefined,
  problema: string | null,
  ahora: number,
): Paso {
  const desde = oferta.terminado_en ?? oferta.creado_en;
  const deEstaVuelta =
    g && oferta.estado === "listo" && g.creado_en >= desde ? g : null;
  if (deEstaVuelta) {
    return {
      estado:
        deEstaVuelta.estado === "procesando"
          ? "trabajando"
          : deEstaVuelta.estado === "listo"
            ? "listo"
            : "error",
      generacion: deEstaVuelta,
      problema: null,
    };
  }
  if (problema) return { estado: "error", generacion: null, problema };
  if (
    oferta.estado === "listo" &&
    ahora - Date.parse(desde) > PLAZO_PARA_PARTIR_MS
  ) {
    return {
      estado: "error",
      generacion: null,
      problema: "No alcanzó a partir: reinténtalo.",
    };
  }
  return { estado: "espera", generacion: null, problema: null };
}

/** null = la oferta no salió de «Armar postulación» (o no hay oferta). */
export function vueltaDeLaPostulacion(
  oferta: TrabajoDeOferta | null | undefined,
  generaciones: GeneracionesDeOportunidad | null | undefined,
  ahora = Date.now(),
): Vuelta | null {
  const armada = oferta?.parametros?.postulacion;
  if (!oferta || !armada) return null;
  const problemas = armada.problemas ?? [];
  const problemaDe = (que: string) =>
    problemas.find((p) => p.startsWith(que)) ?? null;
  // Una compra ágil sin formularios no tiene anexos (decisión 94), y con
  // todo firmado no se rehacen: no es que no alcanzaran a partir (99).
  const anexos =
    armada.anexos === false
      ? NO_VA
      : armada.firmados
        ? FIRMADOS
        : pasoDe(oferta, generaciones?.anexos, problemaDe("Los anexos"), ahora);
  const propuesta = armada.propuesta
    ? pasoDe(
        oferta,
        generaciones?.propuesta,
        problemaDe("La propuesta técnica"),
        ahora,
      )
    : NO_VA;
  const estado =
    oferta.estado === "procesando"
      ? "trabajando"
      : oferta.estado === "listo"
        ? "listo"
        : "error";
  return {
    total: armada.total,
    oferta: estado,
    anexos,
    propuesta,
    avisos: problemas.filter(
      (p) =>
        !p.startsWith("Los anexos") && !p.startsWith("La propuesta técnica"),
    ),
    enCurso:
      estado === "trabajando" ||
      (estado === "listo" &&
        [anexos, propuesta].some(
          (p) => p.estado === "trabajando" || p.estado === "espera",
        )),
  };
}
