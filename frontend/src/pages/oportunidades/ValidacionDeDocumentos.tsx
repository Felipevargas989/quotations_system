import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import {
  getAdjuntos,
  getAnalisis,
  getValidacion,
  pedirValidacion,
  type ResultadoDeValidacion,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import { sinLosWordYaFirmados } from "./firmarTodos";
import {
  notasDeLaPostulacion,
  type PendienteDelDocumento,
  pendientesPorDocumento,
  type Requisito,
} from "./notasDeLaPostulacion";
import {
  contarPorEstadoDeValidacion,
  ESTADOS_DE_VALIDACION,
  LISTO_PARA_POSTULAR,
  textoDeCosto,
} from "./oportunidades.utils";
import { claveDeLaPostulacion, useGeneraciones } from "./useGeneraciones";

// VALIDAR DOCUMENTOS (doc 17, sprint 3, paso 3; migración 127). Felipe,
// 17-10: "y lo más importante validar documentos". Opus 5.5 toma el
// checklist del último análisis de las bases y revisa, requisito por
// requisito, lo que vas a presentar ("Mi postulación"), tu carpeta de
// documentos (con su vencimiento) y tus datos de "Mi empresa". Corre por
// detrás y la pantalla pregunta cada 5 segundos.
//
// Desde el 17-10 aquí solo va lo que hay que arreglar: el estado de cada
// requisito, también los listos, sale al lado de "Lo que hay que
// presentar", en «Bases y criterios» (una sola lista, no dos).
//
// Desde el 26-10 (decisión 79) es «Validar todo», en el paso 3 («Subir a
// Mercado Público»): una línea con la última validación y, debajo, solo lo
// que no es de ningún documento (el plazo de ejecución, un certificado de
// la carpeta). Lo de cada formulario va bajo él, en «Tus documentos»
// (notasDeLaPostulacion.ts). Felipe: "hay demasiadas partes en donde tengo
// comentarios de cosas que faltan".
//
// Desde el 26-10 en la noche (decisión 84) aquí va TODO lo pendiente: lo de
// cada documento (lo que dejó la IA al llenarlo, lo que anotó al firmar, lo
// de la última validación y la firma que falta), agrupado bajo su nombre, y
// después lo que no es de ningún documento. Felipe: "estas salvedades y
// todas saquémoslas de acá y coloquémoslas siempre en el punto 3".

const ESTADO_FALTA = ESTADOS_DE_VALIDACION[1];
const ESTADO_REVISAR = ESTADOS_DE_VALIDACION[3];

export default function ValidacionDeDocumentos({
  oportunidadId,
}: {
  readonly oportunidadId: number;
}) {
  const qc = useQueryClient();
  const clave = ["oportunidades", "validacion", oportunidadId];
  const { data: analisis } = useQuery({
    queryKey: ["oportunidades", "analisis", oportunidadId],
    queryFn: () => getAnalisis(oportunidadId),
  });
  const { data: validacion, isPending } = useQuery({
    queryKey: clave,
    queryFn: () => getValidacion(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.estado === "procesando" ? 5000 : false,
  });
  const { data: generaciones } = useGeneraciones(oportunidadId);
  const { data: postulacion = [] } = useQuery({
    queryKey: claveDeLaPostulacion(oportunidadId),
    queryFn: () => getAdjuntos(oportunidadId, "postulacion"),
  });

  const pedir = useMutation({
    mutationFn: () => pedirValidacion(oportunidadId),
    onSuccess: (fila) => qc.setQueryData(clave, fila),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo pedir la validación.")),
  });

  const hayAnalisis = analisis?.estado === "listo";
  const procesando = validacion?.estado === "procesando" || pedir.isPending;
  const r = validacion?.estado === "listo" ? validacion.resultado : null;
  const documentos = sinLosWordYaFirmados(postulacion);
  const { porDocumento, requisitos, otros } = notasDeLaPostulacion(
    documentos,
    generaciones,
    validacion,
  );
  const pendientes = pendientesPorDocumento(documentos, porDocumento);
  const cumplen = r ? contarPorEstadoDeValidacion(r.requisitos).cumple : 0;
  // Decisión 83: desde el 26-10 lee todo lo que va en el ZIP y anota la
  // carpeta de cada archivo; las de antes leían solo «Mi postulación». Sin
  // validación el motor responde vacío (""), sin `archivos`.
  const leyoElZip =
    validacion?.archivos?.some((a) => Boolean(a.carpeta)) ?? false;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => pedir.mutate()}
          disabled={procesando || !hayAnalisis}
          title={!hayAnalisis ? "Primero analiza las bases" : undefined}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {procesando ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ShieldCheck size={14} />
          )}
          Validar todo
        </button>
        <span className="text-xs text-gray-500">
          {isPending
            ? "Cargando…"
            : procesando
              ? "Revisando todo contra las bases… suele tardar entre 1 y 3 minutos."
              : r && validacion
                ? `Última: ${formatMomento(validacion.terminado_en ?? validacion.creado_en, "diaHora")} · ${cumplen} de ${r.requisitos.length} requisitos cumplen${leyoElZip ? ` · leyó ${validacion.archivos.length} archivos del ZIP` : ""}${validacion.costo_usd != null ? ` · costó ${textoDeCosto(validacion.costo_usd)}` : ""}`
                : validacion?.estado === "error"
                  ? `Intentado el ${formatMomento(validacion.terminado_en ?? validacion.creado_en, "diaHora")}`
                  : hayAnalisis
                    ? "La IA lee todo lo que va en el ZIP y lo revisa contra lo que piden las bases. La decisión de subir es tuya."
                    : "Primero analiza las bases: la validación revisa su checklist."}
        </span>
      </div>

      {!procesando && validacion?.estado === "error" && (
        <p className="text-sm text-red-600">{validacion.error}</p>
      )}
      {!procesando && (
        <Resultado
          r={r}
          pendientes={pendientes}
          requisitos={requisitos}
          otros={otros}
        />
      )}
      {!procesando && validacion && validacion.no_leidos.length > 0 && (
        <p className="text-xs text-amber-700">
          No leyó: {validacion.no_leidos.map((n) => n.nombre).join(", ")}
        </p>
      )}
    </div>
  );
}

function Resultado({
  r,
  pendientes,
  requisitos,
  otros,
}: {
  readonly r: ResultadoDeValidacion | null;
  readonly pendientes: PendienteDelDocumento[];
  readonly requisitos: Requisito[];
  readonly otros: string[];
}) {
  const listo = r ? LISTO_PARA_POSTULAR[r.listo] : null;
  return (
    <div className="space-y-2">
      {listo && (
        <p
          className={`inline-block rounded border px-2 py-1 text-sm font-semibold ${listo.clases}`}
        >
          {listo.titulo}
        </p>
      )}
      {pendientes.length + requisitos.length + otros.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {pendientes.map((p) => {
            const estado = p.notas.some((n) => n.tono === "completar")
              ? ESTADO_FALTA
              : ESTADO_REVISAR;
            return (
              <li key={`doc-${p.adjunto.id}`} className="flex gap-3 px-3 py-2">
                <span
                  className={`mt-0.5 h-fit shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${estado.clases}`}
                >
                  {estado.label}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{p.adjunto.nombre}</p>
                  {p.notas.length > 0 && (
                    <ul className="list-disc pl-4 text-xs space-y-0.5">
                      {p.notas.map((n) => (
                        <li
                          key={n.texto}
                          className={
                            n.tono === "completar"
                              ? "text-amber-800"
                              : "text-gray-600"
                          }
                        >
                          {n.texto}
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.aviso && (
                    <p className="text-xs italic text-gray-500">{p.aviso}</p>
                  )}
                </div>
              </li>
            );
          })}
          {requisitos.map((q, i) => {
            const estado =
              ESTADOS_DE_VALIDACION.find((e) => e.value === q.estado) ??
              ESTADO_REVISAR;
            return (
              <li key={`${q.que}-${i}`} className="flex gap-3 px-3 py-2">
                <span
                  className={`mt-0.5 h-fit shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${estado.clases}`}
                >
                  {estado.label}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{q.que}</p>
                  <p className="text-xs text-gray-500">
                    {q.observacion}
                    {q.donde && ` · ${q.donde}`}
                  </p>
                </div>
              </li>
            );
          })}
          {otros.map((o) => (
            <li key={o} className="flex gap-3 px-3 py-2">
              <span
                className={`mt-0.5 h-fit shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_REVISAR.clases}`}
              >
                {ESTADO_REVISAR.label}
              </span>
              <p className="min-w-0 text-sm text-gray-700">{o}</p>
            </li>
          ))}
        </ul>
      )}
      {r && (
        <p className="text-xs text-gray-500">
          El estado de cada requisito, también los que cumplen, está en «Bases y
          criterios».
        </p>
      )}
    </div>
  );
}
