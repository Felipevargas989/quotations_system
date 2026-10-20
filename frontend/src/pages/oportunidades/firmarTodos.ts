import type {
  AdjuntoDeOportunidad,
  GeneracionesDeOportunidad,
} from "../../services/oportunidades.service";
import { sePuedeFirmar } from "./oportunidades.utils";

// «FIRMAR TODOS» (19-10). Desde que cada formulario sale en su propio Word
// (Felipe: "tienen que quedar por separado cada uno, el 1, el 2, el 3, el
// 4"), firmar de a uno es lento. Se firma lo último que hizo la IA (los
// anexos y la propuesta de la última vuelta) que todavía no tiene su
// firmado; lo de vueltas anteriores no. La firma acepta hasta 10 a la vez.

export const MAX_PARA_FIRMAR = 10;

/** Lo que se ve en «Mi postulación» (decisión 57, 20-10; Felipe: "una vez
 *  firmados los documentos se debería eliminar o dejar de ver el Word, y
 *  dejar solo el PDF firmado"): el Word de la IA que ya tiene su firmado no
 *  se muestra. Desde la decisión 58 el Word se borra al firmar; esto
 *  esconde los que se firmaron antes. */
export function sinLosWordYaFirmados(
  postulacion: AdjuntoDeOportunidad[],
): AdjuntoDeOportunidad[] {
  const firmados = new Set(
    postulacion.filter((a) => a.origen === "firmado").map((a) => a.viene_de),
  );
  return postulacion.filter(
    (a) => !(a.origen === "generado" && firmados.has(a.id)),
  );
}

export function sinFirmarDeLaUltimaVuelta(
  generaciones: GeneracionesDeOportunidad | null | undefined,
  postulacion: AdjuntoDeOportunidad[],
): number[] {
  const hechos = [generaciones?.anexos, generaciones?.propuesta].flatMap((g) =>
    g?.estado === "listo"
      ? (g.resultado?.documentos ?? []).map((d) => d.adjunto_id)
      : [],
  );
  const firmados = new Set(
    postulacion.filter((a) => a.origen === "firmado").map((a) => a.viene_de),
  );
  const porId = new Map(postulacion.map((a) => [a.id, a]));
  return hechos
    .filter((id) => {
      const a = porId.get(id);
      return a !== undefined && sePuedeFirmar(a) && !firmados.has(id);
    })
    .slice(0, MAX_PARA_FIRMAR);
}
