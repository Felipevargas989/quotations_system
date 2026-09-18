import type {
  AudienciaElegida,
  AudienciasMarketing,
  CampanaMarketing,
  FiltroSegmento,
} from "../../services/marketing.service";
import { toast } from "../../components/toast/Toast";

/** Tope de audiencias por campaña: el MISMO número que el candado del
 *  motor (CrearCampanaDto / EditarCampanaDto). Nació en 10 el 27-08;
 *  Felipe chocó con él el 18-09 al elegir "todas" y pidió 30. */
export const MAX_AUDIENCIAS_POR_CAMPANA = 30;

/**
 * Avisa en español ANTES de guardar: si la selección nueva pasa el tope,
 * se rechaza y se explica; si no, se aplica. Pieza compartida entre el
 * creador y el editor, cero copias.
 */
export const elegirAudiencias = (
  nuevas: string[],
  aplicar: (v: string[]) => void,
): void => {
  if (nuevas.length > MAX_AUDIENCIAS_POR_CAMPANA) {
    toast.warn(
      `Puedes elegir hasta ${String(MAX_AUDIENCIAS_POR_CAMPANA)} audiencias por campaña (intentaste ${String(nuevas.length)}). Ojo: "Todos los clientes" ya incluye a todas las guardadas.`,
    );
    return;
  }
  aplicar(nuevas);
};

/**
 * LAS AUDIENCIAS DE UNA CAMPAÑA, traducidas (28-08). Pieza compartida
 * entre el creador y el editor de la ficha: mismas opciones, misma
 * traducción, cero copias. Códigos: "todos" | "g:<id>" | "i:<nombre>".
 */

export const opcionesDeAudiencias = (audiencias?: AudienciasMarketing) => [
  {
    value: "todos",
    label: `Todos los clientes (${String(audiencias?.clientes_con_correo ?? 0)} en vivo)`,
  },
  ...(audiencias?.guardadas ?? []).map((g) => ({
    value: `g:${String(g.id)}`,
    label: `${g.nombre} (${String(g.total)} hoy, en vivo)`,
  })),
  ...(audiencias?.importadas ?? []).map((a) => ({
    value: `i:${a.audiencia}`,
    label: `${a.audiencia} (${String(a.contactos)}, importada)`,
  })),
];

export const unaAudiencia = (sel: string): AudienciaElegida => {
  if (sel === "todos") {
    return {
      audiencia_tipo: "segmento",
      filtro: {} as FiltroSegmento,
      audiencia_ref: "Todos los clientes",
    };
  }
  if (sel.startsWith("g:")) {
    return { audiencia_tipo: "segmento", audiencia_id: Number(sel.slice(2)) };
  }
  return { audiencia_tipo: "importada", audiencia_ref: sel.slice(2) };
};

/**
 * De vuelta: qué códigos tiene marcados una campaña ya guardada.
 * `aMedida` avisa cuando alguna audiencia es un filtro suelto que no
 * vive en la estantería — ese no se puede re-editar desde la ficha.
 */
export const seleccionDeCampana = (
  campana: CampanaMarketing,
): { valores: string[]; aMedida: boolean } => {
  const lista = campana.audiencias?.length
    ? campana.audiencias
    : [
        {
          audiencia_tipo: campana.audiencia_tipo,
          audiencia_id: campana.audiencia_id,
          audiencia_ref: campana.audiencia_ref,
          filtro: campana.filtro,
        },
      ];
  const valores: string[] = [];
  let aMedida = false;
  for (const a of lista) {
    if (a.audiencia_tipo === "importada" && a.audiencia_ref) {
      valores.push(`i:${a.audiencia_ref}`);
    } else if (a.audiencia_id != null) {
      valores.push(`g:${String(a.audiencia_id)}`);
    } else if (
      a.audiencia_tipo === "segmento" &&
      (!a.filtro || Object.keys(a.filtro).length === 0)
    ) {
      valores.push("todos");
    } else {
      aMedida = true;
    }
  }
  return { valores, aMedida };
};
