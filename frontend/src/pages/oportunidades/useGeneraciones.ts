import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getGeneraciones } from "../../services/oportunidades.service";
import { algunaEnCurso } from "./oportunidades.utils";

// LOS TRABAJOS DE LA IA QUE HACEN DOCUMENTOS (doc 17, sprint 3, paso 4): el
// último de cada tipo (anexos, firma, propuesta). Mientras alguno corre, se
// pregunta cada 5 segundos; cuando termina, lo que hizo aparece en «Mi
// postulación» sin recargar.

export const claveDeGeneraciones = (oportunidadId: number) => [
  "oportunidades",
  "generaciones",
  oportunidadId,
];

export const claveDeLaPostulacion = (oportunidadId: number) => [
  "oportunidades",
  "adjuntos",
  oportunidadId,
  "postulacion",
];

export function useGeneraciones(oportunidadId: number) {
  const qc = useQueryClient();
  const consulta = useQuery({
    queryKey: claveDeGeneraciones(oportunidadId),
    queryFn: () => getGeneraciones(oportunidadId),
    refetchInterval: (q) => (algunaEnCurso(q.state.data) ? 5000 : false),
  });

  const enCurso = useRef<Set<number>>(new Set());
  useEffect(() => {
    const data = consulta.data;
    if (!data) return;
    const ahora = new Set(
      Object.values(data)
        .filter((g) => g?.estado === "procesando")
        .map((g) => g?.id ?? 0),
    );
    const termino = [...enCurso.current].some((id) => !ahora.has(id));
    enCurso.current = ahora;
    if (termino) {
      void qc.invalidateQueries({
        queryKey: claveDeLaPostulacion(oportunidadId),
      });
    }
  }, [consulta.data, qc, oportunidadId]);

  return consulta;
}
