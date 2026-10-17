import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { type ReactNode, useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import FileViewLink from "../../components/FileViewLink";
import { toast } from "../../components/toast/Toast";
import { useArrastreDeArchivos } from "../../hooks/useArrastreDeArchivos";
import {
  borrarAdjunto,
  getAdjuntos,
  subirAdjunto,
  type AdjuntoDeOportunidad,
  type SeccionDeArchivos,
  type TipoProceso,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import { descargarDelBalde } from "./descargas";
import {
  EXTENSIONES_DE_ADJUNTOS,
  MAX_MB_POR_ADJUNTO,
  ORIGENES,
  problemaDelAdjunto,
  seVeEnElVisor,
  tamanoLegible,
  urlMercadoPublico,
} from "./oportunidades.utils";

// LAS BASES Y ANEXOS (doc 17 §12 punto 8, opción d). Felipe, 17-10: "ok
// dale con el botón y arrastro".
//
// Mercado Público protege su lista de adjuntos con un control antirrobots
// que esta casa no esquiva. Los baja una persona desde su navegador (el
// botón abre la ficha allá) y los arrastra aquí. PDF e imágenes se ven con
// el visor de la casa (FileViewLink); Word, Excel y ZIP se descargan.
//
// La misma pieza sirve para "Mi postulación" (sprint 3, paso 3; migración
// 127): lo que la empresa va a presentar, que después se valida contra el
// checklist de las bases. Ahí cada archivo lleva su sello si lo hizo la IA
// (sin firma) o si ya está firmado (paso 4, migración 128), y quien la usa
// puede sumar acciones por fila (Firmar) y algo al pie (MiPostulacion).

export default function AdjuntosDeLaOportunidad({
  oportunidadId,
  codigo,
  tipo,
  seccion = "bases",
  accionesDeFila,
  pie,
}: {
  readonly oportunidadId: number;
  readonly codigo: string;
  readonly tipo: TipoProceso;
  readonly seccion?: SeccionDeArchivos;
  readonly accionesDeFila?: (a: AdjuntoDeOportunidad) => ReactNode;
  readonly pie?: ReactNode;
}) {
  const qc = useQueryClient();
  const clave = ["oportunidades", "adjuntos", oportunidadId, seccion];
  const { data: adjuntos = [], isPending } = useQuery({
    queryKey: clave,
    queryFn: () => getAdjuntos(oportunidadId, seccion),
  });

  const [subiendo, setSubiendo] = useState<{
    actual: number;
    total: number;
    nombre: string;
  } | null>(null);
  const [porBorrar, setPorBorrar] = useState<number | null>(null);

  // De a uno: así cada archivo dice si subió o por qué no.
  const recibir = async (archivos: File[]) => {
    const buenos = archivos.filter((a) => {
      const problema = problemaDelAdjunto(a);
      if (problema) toast.error(problema);
      return !problema;
    });
    let subidos = 0;
    for (const [i, archivo] of buenos.entries()) {
      setSubiendo({
        actual: i + 1,
        total: buenos.length,
        nombre: archivo.name,
      });
      try {
        await subirAdjunto(oportunidadId, archivo, seccion);
        subidos += 1;
      } catch (e) {
        toast.error(humanizeApiError(e, `No se pudo subir "${archivo.name}".`));
      }
    }
    setSubiendo(null);
    if (subidos > 0) {
      toast.success(
        subidos === 1 ? "Archivo subido." : `${subidos} archivos subidos.`,
      );
      void qc.invalidateQueries({ queryKey: clave });
    }
  };

  const { arrastrando, zona } = useArrastreDeArchivos(
    (archivos) => void recibir(archivos),
    { desactivado: subiendo !== null },
  );

  const borrar = useMutation({
    mutationFn: (adjuntoId: number) => borrarAdjunto(oportunidadId, adjuntoId),
    onSuccess: () => {
      toast.success("Archivo eliminado.");
      void qc.invalidateQueries({ queryKey: clave });
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo eliminar.")),
    onSettled: () => setPorBorrar(null),
  });

  // Word, Excel y ZIP: se descargan con su nombre original.
  const descargar = async (a: AdjuntoDeOportunidad) => {
    try {
      await descargarDelBalde(a.ruta, a.nombre);
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo descargar."));
    }
  };

  return (
    <section {...zona} className="bg-white rounded-lg shadow p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-sm font-semibold text-gray-900">
            {seccion === "postulacion" ? "Mi postulación" : "Bases y anexos"}
          </h2>
          <p className="text-xs text-gray-500">
            {seccion === "postulacion"
              ? "Lo que vas a presentar: anexos llenos y firmados, propuesta, oferta, certificados. Después valídalo contra lo que piden las bases."
              : tipo === "licitacion"
                ? "En Mercado Público, pincha «Ver adjuntos» arriba de la ficha y baja los archivos. Después arrástralos aquí."
                : "En Mercado Público, los archivos están en la misma ficha de la compra ágil. Bájalos y arrástralos aquí."}
          </p>
        </div>
        {seccion === "bases" && (
          <a
            href={urlMercadoPublico(codigo, tipo)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
          >
            Bajar de Mercado Público
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {isPending ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : (
        adjuntos.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {adjuntos.map((a) => {
              const sello = ORIGENES[a.origen];
              return (
                <li key={a.id} className="py-2 flex items-center gap-3">
                  <FileText size={16} className="shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p
                      className="flex items-center gap-2 text-sm text-gray-800"
                      title={a.nombre}
                    >
                      <span className="truncate">{a.nombre}</span>
                      {sello && (
                        <span
                          className={`shrink-0 px-1.5 py-0.5 text-[11px] font-semibold rounded ${sello.clases}`}
                        >
                          {sello.label}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {tamanoLegible(a.bytes)}
                      {a.quien?.full_name
                        ? ` · ${a.quien.full_name}`
                        : ""} · {formatMomento(a.creado_en, "diaHora")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {accionesDeFila?.(a)}
                    {seVeEnElVisor(a.ruta) ? (
                      <FileViewLink url={a.ruta} title={a.nombre} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => void descargar(a)}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Descargar
                      </button>
                    )}
                    {porBorrar === a.id ? (
                      <ConfirmInline
                        question="¿Eliminar?"
                        onYes={() => borrar.mutate(a.id)}
                        onNo={() => setPorBorrar(null)}
                        busy={borrar.isPending}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPorBorrar(a.id)}
                        className="text-gray-300 hover:text-red-500"
                        title="Eliminar archivo"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      )}

      {pie}

      <div
        className={`rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
          arrastrando ? "border-blue-400 bg-blue-50/60" : "border-gray-200"
        }`}
      >
        {subiendo ? (
          <p className="text-sm text-gray-600">
            Subiendo {subiendo.actual} de {subiendo.total}:{" "}
            <b className="text-gray-800">{subiendo.nombre}</b>…
          </p>
        ) : (
          <>
            <Upload size={18} className="mx-auto mb-1 text-gray-400" />
            <p
              className={
                arrastrando
                  ? "text-sm font-bold text-blue-600"
                  : "text-sm text-gray-600"
              }
            >
              {arrastrando
                ? "¡Suéltalos aquí! ↓"
                : "Arrastra aquí los archivos"}
            </p>
            <label className="mt-2 inline-block cursor-pointer px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 focus-within:ring-2 focus-within:ring-blue-500">
              o elígelos
              <input
                type="file"
                multiple
                className="sr-only"
                accept={EXTENSIONES_DE_ADJUNTOS.map((e) => `.${e}`).join(",")}
                onChange={(e) => {
                  const elegidos = Array.from(e.target.files ?? []);
                  // Valor limpio: volver a elegir el MISMO archivo funciona.
                  e.currentTarget.value = "";
                  if (elegidos.length > 0) void recibir(elegidos);
                }}
              />
            </label>
            <p className="mt-1 text-xs text-gray-400">
              PDF, Word, Excel, ZIP o imágenes · hasta {MAX_MB_POR_ADJUNTO} MB
              cada uno
            </p>
          </>
        )}
      </div>
    </section>
  );
}
