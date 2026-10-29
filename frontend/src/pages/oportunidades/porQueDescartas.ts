import { toast } from "../../components/toast/Toast";
import { MOTIVOS_DEL_DESCARTE } from "../../services/decisiones";
import { ponerMotivoDelDescarte } from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";

// DESPUÉS DE DESCARTAR (decisión 113 del doc 17): el aviso de siempre trae
// el porqué, opcional y de un clic, para que el semáforo aprenda. Descartar
// sigue siendo un clic; si nadie elige, el aviso se va solo.

/** Lo que dura el aviso con los botones: hay que alcanzar a leerlo. */
export const DURACION_DEL_PORQUE = 12_000;

export const preguntarPorQue = (id: number, aviso: string) =>
  toast.success(`${aviso} ¿Por qué? Así el semáforo aprende.`, {
    duracion: DURACION_DEL_PORQUE,
    acciones: MOTIVOS_DEL_DESCARTE.map((m) => ({
      etiqueta: m.etiqueta,
      alHacer: () => {
        ponerMotivoDelDescarte(id, m.valor).then(
          () => toast.success(`Anotado: «${m.etiqueta}».`),
          (e: unknown) =>
            toast.error(humanizeApiError(e, "No se pudo anotar el motivo.")),
        );
      },
    })),
  });
