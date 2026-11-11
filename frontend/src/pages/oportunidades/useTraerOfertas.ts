import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "../../components/toast/Toast";
import {
  getEstadoDeTraerOfertas,
  type OfertasTraidas,
  traerOfertas,
} from "../../services/comparacion.service";
import { humanizeApiError } from "../../utils/apiErrors";

// «TRAER LAS OFERTAS» (decisión 123 del doc 17, 10-11). Felipe, con una
// licitación postulada y ya cerrada, en «Comparación de ofertas»: "acá
// eventia no me puede traer los documentos de la otra propuesta para
// compararlas" y "con un botón acá en eventia". El motor responde al tiro
// y sigue por detrás (Mercado Público entrega los archivos de a uno): aquí
// se le pregunta cómo va al entrar a la pestaña y, mientras trae, cada 3
// segundos, como en «Traer los documentos» (`useEstadoDeTraer`). Con cada
// respuesta se pide de nuevo la lista, así las ofertas van apareciendo.

export const claveDeLaCompetencia = (oportunidadId: number) => [
  "oportunidades",
  "adjuntos",
  oportunidadId,
  "competencia",
];

export const claveDeTraerOfertas = (oportunidadId: number) => [
  "oportunidades",
  "competencia",
  oportunidadId,
  "traer",
];

const PREGUNTAR_MIENTRAS_TRAE = 3000;

/** Lo que se lee debajo del botón mientras trae. El botón le guarda el
 *  lugar aunque no se vea, para que nada se mueva al apretar. */
export const MIENTRAS_TRAE = "Puedes salir de la ficha: van llegando solas.";

const archivos = (n: number) => (n === 1 ? "1 archivo" : `${n} archivos`);
const oferentes = (n: number) => (n === 1 ? "1 oferente" : `${n} oferentes`);

/** Lo que dejó la vuelta, en una línea. `ojo`: falta algo por hacer. */
export function avisoDeLoTraido(r: OfertasTraidas): {
  tono: "bien" | "ojo";
  texto: string;
} {
  if (!r.publicadas) {
    return {
      tono: "ojo",
      texto:
        "Mercado Público todavía no muestra las ofertas de esta licitación: aparecen con la apertura, después del cierre.",
    };
  }
  if (r.oferentes === 0) {
    return {
      tono: "bien",
      texto: "Solo tu empresa presentó oferta: no hay competencia que traer.",
    };
  }
  const partes: string[] = [];
  if (r.traidos > 0) {
    const llegaron =
      r.traidos === 1 ? "Llegó 1 archivo" : `Llegaron ${r.traidos} archivos`;
    const ya =
      r.yaEstaban > 0
        ? ` (${r.yaEstaban} ya ${r.yaEstaban === 1 ? "estaba" : "estaban"})`
        : "";
    partes.push(`${llegaron} de ${oferentes(r.oferentes)}${ya}.`);
  } else if (r.yaEstaban > 0) {
    partes.push(
      `Ya estaba todo: ${archivos(r.yaEstaban)} de ${oferentes(r.oferentes)}.`,
    );
  } else if (!r.incompleto) {
    partes.push(
      `${r.oferentes === 1 ? "El otro oferente no adjuntó" : `Los otros ${r.oferentes} oferentes no adjuntaron`} archivos que se puedan traer.`,
    );
  }
  if (r.noSeTraen > 0) {
    partes.push(
      `${r.noSeTraen === 1 ? "1 no se trae" : `${r.noSeTraen} no se traen`}: comprimidos o de más de 30 MB.`,
    );
  }
  if (r.incompleto) partes.push("Quedó algo sin traer: aprieta de nuevo.");
  return { tono: r.incompleto ? "ojo" : "bien", texto: partes.join(" ") };
}

export type LineaDeTraerOfertas = {
  tono: "espera" | "bien" | "ojo" | "error";
  texto: string;
};

export function useTraerOfertas(oportunidadId: number): {
  trayendo: boolean;
  pedir: () => void;
  /** Lo que va debajo del botón: que está trayendo, o cómo terminó la
   *  última vuelta; null si no hay nada que decir. */
  linea: LineaDeTraerOfertas | null;
} {
  const qc = useQueryClient();
  const { data, dataUpdatedAt } = useQuery({
    queryKey: claveDeTraerOfertas(oportunidadId),
    queryFn: () => getEstadoDeTraerOfertas(oportunidadId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: (q) =>
      q.state.data?.trayendo ? PREGUNTAR_MIENTRAS_TRAE : false,
  });

  const pedido = useMutation({
    mutationFn: () => traerOfertas(oportunidadId),
    onSuccess: (estado) =>
      qc.setQueryData(claveDeTraerOfertas(oportunidadId), estado),
    onError: (e) => {
      toast.error(humanizeApiError(e, "No se pudieron traer las ofertas."));
      // Un 409: ya las estaba trayendo. Que el botón lo muestre.
      void qc.invalidateQueries({
        queryKey: claveDeTraerOfertas(oportunidadId),
      });
    },
  });

  // Con cada respuesta del motor mientras trae, la lista de la competencia
  // se pide de nuevo. Cuando deja de traer, una vez más, y el aviso de lo
  // que llegó: solo a quien lo estaba mirando (quien vuelve después lo lee
  // debajo del botón).
  const veniaTrayendo = useRef(false);
  useEffect(() => {
    if (!data) return;
    const refrescar = () =>
      void qc.invalidateQueries({
        queryKey: claveDeLaCompetencia(oportunidadId),
      });
    if (data.trayendo) {
      veniaTrayendo.current = true;
      refrescar();
      return;
    }
    if (!veniaTrayendo.current) return;
    veniaTrayendo.current = false;
    refrescar();
    if (data.ultima?.error) {
      toast.error(data.ultima.error);
    } else if (data.ultima?.resultado) {
      const aviso = avisoDeLoTraido(data.ultima.resultado);
      if (aviso.tono === "bien") toast.success(aviso.texto);
      else toast.warn(aviso.texto);
    }
  }, [data, dataUpdatedAt, oportunidadId, qc]);

  const trayendo = pedido.isPending || (data?.trayendo ?? false);
  const ultima = data?.ultima ?? null;
  const linea: LineaDeTraerOfertas | null = trayendo
    ? { tono: "espera", texto: MIENTRAS_TRAE }
    : ultima?.error
      ? { tono: "error", texto: ultima.error }
      : ultima?.resultado
        ? avisoDeLoTraido(ultima.resultado)
        : null;

  return { trayendo, pedir: () => pedido.mutate(), linea };
}
