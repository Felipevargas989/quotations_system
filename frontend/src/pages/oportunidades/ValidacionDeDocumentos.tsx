import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "../../components/toast/Toast";
import {
  getAdjuntos,
  getAnalisis,
  getValidacion,
  pedirValidacion,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import { normalizeText } from "../../utils/searchMatch";
import type { FilaDelChecklist } from "./checklistDeDocumentos";
import { sinLosWordYaFirmados } from "./firmarTodos";
import {
  notaGrave,
  notasDeLaPostulacion,
  pendientesPorDocumento,
} from "./notasDeLaPostulacion";
import {
  contarPorEstadoDeValidacion,
  LISTO_PARA_POSTULAR,
  textoDeCosto,
} from "./oportunidades.utils";
import { useChecklistDeDocumentos } from "./useChecklistDeDocumentos";
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
//
// Y desde la decisión 85, cada cosa en rojo «Grave» o en amarillo «Menor»,
// lo grave primero. Felipe: "no distingue una falta menor en amarillo de una
// grave en rojo; que falte un formulario es grave". Arriba de todo, lo que
// falta en el ZIP según las bases (un formulario que no está, un documento
// que falta o venció): sale sin validar, y con eso la oferta todavía no
// está lista.

const GRAVE = { label: "Grave", clases: "bg-red-50 text-red-700" };
const MENOR = { label: "Menor", clases: "bg-amber-100 text-amber-800" };

/** Lo que dice cada documento que falta en el ZIP. */
const QUE_LE_PASA: Partial<Record<FilaDelChecklist["estado"], string>> = {
  lo_arma_la_ia: "No está en tus documentos: vuelve a armar la postulación.",
  falta: "No está en tu carpeta ni en tu postulación.",
};

/** Lo que piden las bases con la oferta y todavía no va en el ZIP. */
const faltaEnElZip = (f: FilaDelChecklist) =>
  f.cuando === "con_la_oferta" &&
  (f.estado === "falta" ||
    f.estado === "vencido" ||
    f.estado === "lo_arma_la_ia");

export default function ValidacionDeDocumentos({
  oportunidadId,
  cierre = null,
}: {
  readonly oportunidadId: number;
  /** El cierre, para saber qué documento de la carpeta vence antes. */
  readonly cierre?: string | null;
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
  const bases = hayAnalisis ? analisis.resultado : null;
  const faltantes = useChecklistDeDocumentos(
    oportunidadId,
    bases,
    cierre,
  ).filter(faltaEnElZip);
  const procesando = validacion?.estado === "procesando" || pedir.isPending;
  const r = validacion?.estado === "listo" ? validacion.resultado : null;
  const documentos = sinLosWordYaFirmados(postulacion);
  const { porDocumento, requisitos, otrosGraves, otros } = notasDeLaPostulacion(
    documentos,
    generaciones,
    validacion,
    (bases?.requisitos ?? []).map((q) => q.obligatorio),
  );
  const pendientes = pendientesPorDocumento(documentos, porDocumento);
  // Lo que la validación ya nombra igual no se repite como falta del ZIP.
  const nombrados = new Set(requisitos.map((q) => normalizeText(q.que)));
  const delZip = faltantes.filter(
    (f) => !nombrados.has(normalizeText(f.nombre)),
  );
  const cumplen = r ? contarPorEstadoDeValidacion(r.requisitos).cumple : 0;
  // Decisión 83: desde el 26-10 lee todo lo que va en el ZIP y anota la
  // carpeta de cada archivo; las de antes leían solo «Mi postulación». Sin
  // validación el motor responde vacío (""), sin `archivos`.
  const leyoElZip =
    validacion?.archivos?.some((a) => Boolean(a.carpeta)) ?? false;
  // Si falta algo en el ZIP, todavía no está lista, diga lo que diga la
  // última validación.
  const veredicto = faltantes.length > 0 ? "no" : (r?.listo ?? null);

  const filas: Fila[] = [
    ...delZip.map((f) => ({
      clave: `zip-${f.nombre}`,
      grave: true,
      titulo: f.nombre,
      detalle: <p>{QUE_LE_PASA[f.estado] ?? f.detalle}</p>,
    })),
    ...pendientes.map((p) => ({
      clave: `doc-${p.adjunto.id}`,
      grave: p.notas.some(notaGrave),
      titulo: p.adjunto.nombre,
      detalle: (
        <>
          {p.notas.length > 0 && (
            <ul className="list-disc pl-4 space-y-0.5">
              {p.notas.map((n) => (
                <li
                  key={n.texto}
                  className={notaGrave(n) ? "text-red-700" : "text-gray-600"}
                >
                  {n.texto}
                </li>
              ))}
            </ul>
          )}
          {p.aviso && <p className="italic">{p.aviso}</p>}
        </>
      ),
    })),
    ...requisitos.map((q, i) => ({
      clave: `req-${i}-${q.que}`,
      grave: q.grave,
      titulo: q.que,
      detalle: (
        <p>
          {q.observacion}
          {q.donde && ` · ${q.donde}`}
        </p>
      ),
    })),
    ...otrosGraves.map((o) => ({ clave: `grave-${o}`, grave: true, texto: o })),
    ...otros.map((o) => ({ clave: `otro-${o}`, grave: false, texto: o })),
  ];
  // Lo grave primero; dentro de cada uno, el orden de arriba.
  const enOrden = [
    ...filas.filter((f) => f.grave),
    ...filas.filter((f) => !f.grave),
  ];
  const listo = veredicto ? LISTO_PARA_POSTULAR[veredicto] : null;

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
        <div className="space-y-2">
          {listo && (
            <p
              className={`inline-block rounded border px-2 py-1 text-sm font-semibold ${listo.clases}`}
            >
              {listo.titulo}
            </p>
          )}
          {enOrden.length > 0 && (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {enOrden.map((f) => (
                <FilaPendiente key={f.clave} fila={f} />
              ))}
            </ul>
          )}
          {r && (
            <p className="text-xs text-gray-500">
              El estado de cada requisito, también los que cumplen, está en
              «Bases y criterios».
            </p>
          )}
        </div>
      )}
      {!procesando && validacion && validacion.no_leidos.length > 0 && (
        <p className="text-xs text-amber-700">
          No leyó: {validacion.no_leidos.map((n) => n.nombre).join(", ")}
        </p>
      )}
    </div>
  );
}

/** Una línea de lo pendiente: con título y detalle (un documento, un
 *  requisito, algo que falta en el ZIP) o solo un texto. */
type Fila = { clave: string; grave: boolean } & (
  | { titulo: string; detalle: ReactNode }
  | { texto: string }
);

function FilaPendiente({ fila }: { readonly fila: Fila }) {
  const sello = fila.grave ? GRAVE : MENOR;
  return (
    <li className="flex gap-3 px-3 py-2">
      <span
        className={`mt-0.5 h-fit shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${sello.clases}`}
      >
        {sello.label}
      </span>
      {"texto" in fila ? (
        <p className="min-w-0 text-sm text-gray-700">{fila.texto}</p>
      ) : (
        <div className="min-w-0">
          <p className="text-sm text-gray-900">{fila.titulo}</p>
          <div className="text-xs text-gray-500 space-y-0.5">
            {fila.detalle}
          </div>
        </div>
      )}
    </li>
  );
}
