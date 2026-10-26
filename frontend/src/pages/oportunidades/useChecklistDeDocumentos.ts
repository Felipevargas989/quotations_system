import { useQuery } from "@tanstack/react-query";
import {
  getAdjuntos,
  getOferente,
  type ResultadoDeBases,
} from "../../services/oportunidades.service";
import { checklistDeDocumentos } from "./checklistDeDocumentos";

// LOS DOCUMENTOS A PRESENTAR, CRUZADOS (19-10; desde la decisión 80, 26-10,
// los usan tres bloques de «Bases y criterios»: cómo vas en cada criterio,
// lo que te deja fuera y lo que tienes que presentar). La carpeta de «Mi
// empresa» y lo que va en «Mi postulación», con el vencimiento contra el
// cierre.

/** El cierre, en el día de Chile (AAAA-MM-DD); sin cierre, hoy. */
const diaEnChile = (iso: string | null) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(
    iso ? new Date(iso) : new Date(),
  );

export function useChecklistDeDocumentos(
  oportunidadId: number,
  r: Pick<ResultadoDeBases, "requisitos" | "formularios" | "documentos"> | null,
  cierre: string | null,
) {
  const { data: vista } = useQuery({
    queryKey: ["oportunidades", "oferente"],
    queryFn: getOferente,
  });
  const { data: postulacion = [] } = useQuery({
    queryKey: ["oportunidades", "adjuntos", oportunidadId, "postulacion"],
    queryFn: () => getAdjuntos(oportunidadId, "postulacion"),
  });
  return r
    ? checklistDeDocumentos({
        r,
        carpeta: vista?.documentos ?? [],
        postulacion,
        corte: diaEnChile(cierre),
      })
    : [];
}
