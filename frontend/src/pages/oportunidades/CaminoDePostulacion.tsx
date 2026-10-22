import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Loader2,
  XCircle,
} from "lucide-react";
import {
  type EstadoOportunidad,
  getAdjuntos,
  getAnalisis,
  getValidacion,
} from "../../services/oportunidades.service";
import { avanceDeLaFicha, pasoQueSigue } from "./fichaEnCorto";
import { type EstadoDelPaso, pasosDelAvance } from "./oportunidades.utils";
import { claveDeLaPostulacion, useGeneraciones } from "./useGeneraciones";

// EL CAMINO DE LA POSTULACIÓN (Felipe, 17-10: "vamos con todas"). Arriba de
// las pestañas: Bases → Análisis → Anexos → Firma → Validación → Postulada,
// lo hecho marcado y el paso que sigue destacado. Solo la línea de tiempo
// desde el 20-10: sin el botón al paso que sigue ni la frase (Felipe: "creo
// que ese botón no suma.... saquémoslo"; "deja solamente la línea de
// tiempo, a veces menos es más"). Usa las mismas consultas que las
// pestañas, así que se mueve solo cuando algo cambia.

const PREGUNTAR_MIENTRAS_CORRE = 5000;

const ICONO: Record<EstadoDelPaso, typeof Circle> = {
  hecho: CheckCircle2,
  en_curso: Loader2,
  aviso: AlertTriangle,
  falta: XCircle,
  error: XCircle,
  pendiente: Circle,
};

const TONO: Record<EstadoDelPaso, string> = {
  hecho: "text-green-700",
  en_curso: "text-blue-700",
  aviso: "text-amber-700",
  falta: "text-red-700",
  error: "text-red-700",
  pendiente: "text-gray-400",
};

export default function CaminoDePostulacion({
  oportunidadId,
  estado,
}: {
  readonly oportunidadId: number;
  readonly estado: EstadoOportunidad;
}) {
  const { data: bases } = useQuery({
    queryKey: ["oportunidades", "adjuntos", oportunidadId, "bases"],
    queryFn: () => getAdjuntos(oportunidadId, "bases"),
  });
  const { data: postulacion } = useQuery({
    queryKey: claveDeLaPostulacion(oportunidadId),
    queryFn: () => getAdjuntos(oportunidadId, "postulacion"),
  });
  const { data: analisis } = useQuery({
    queryKey: ["oportunidades", "analisis", oportunidadId],
    queryFn: () => getAnalisis(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.estado === "procesando" ? PREGUNTAR_MIENTRAS_CORRE : false,
  });
  const { data: validacion } = useQuery({
    queryKey: ["oportunidades", "validacion", oportunidadId],
    queryFn: () => getValidacion(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.estado === "procesando" ? PREGUNTAR_MIENTRAS_CORRE : false,
  });
  const { data: generaciones } = useGeneraciones(oportunidadId);

  const pasos = pasosDelAvance({
    estado,
    avance: avanceDeLaFicha({
      bases,
      postulacion,
      analisis,
      generaciones,
      validacion,
    }),
  });
  const sigue = pasoQueSigue(pasos);

  return (
    <div className="bg-white rounded-lg shadow px-5 py-4 space-y-3">
      <ol
        aria-label="El camino de la postulación"
        className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm"
      >
        {pasos.map((p, i) => {
          const Icono = ICONO[p.estado];
          const actual = p.paso === sigue && p.estado !== "en_curso";
          return (
            <li key={p.paso} className="flex items-center gap-1.5">
              {i > 0 && (
                <ChevronRight
                  size={14}
                  className="text-gray-300"
                  aria-hidden="true"
                />
              )}
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${
                  actual
                    ? "bg-blue-50 font-semibold text-blue-700 ring-1 ring-inset ring-blue-200"
                    : TONO[p.estado]
                }`}
              >
                <Icono
                  size={15}
                  className={p.estado === "en_curso" ? "animate-spin" : ""}
                  aria-hidden="true"
                />
                {p.paso}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
