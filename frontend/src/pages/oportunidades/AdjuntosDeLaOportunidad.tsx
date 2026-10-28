import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  CloudDownload,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import FileViewLink from "../../components/FileViewLink";
import { toast } from "../../components/toast/Toast";
import { useArrastreDeArchivos } from "../../hooks/useArrastreDeArchivos";
import {
  borrarAdjunto,
  getAdjuntos,
  subirAdjunto,
  traerAdjuntos,
  type AdjuntoDeOportunidad,
  type SeccionDeArchivos,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import { descargarDelBalde } from "./descargas";
import {
  type ClaseDeArchivo,
  claseDeArchivo,
  COLOR_DEL_ARCHIVO,
  nombreLegible,
} from "./fichaEnCorto";
import {
  EXTENSIONES_DE_ADJUNTOS,
  MAX_MB_POR_ADJUNTO,
  ORIGENES,
  problemaDelAdjunto,
  seVeEnElVisor,
  tamanoLegible,
} from "./oportunidades.utils";
import { claveDeTraer, useEstadoDeTraer } from "./useEstadoDeTraer";

// LAS BASES Y ANEXOS (doc 17 §12 punto 8, opción d). Felipe, 17-10: "ok
// dale con el botón y arrastro".
//
// Mercado Público protege su lista de adjuntos con un control antirrobots
// que esta casa no esquiva. Los baja una persona desde su navegador (el
// enlace «Mercado Público» de la cabecera abre la ficha allá; el segundo
// botón de aquí se quitó el 22-10, decisión 66) y los arrastra aquí. PDF, imágenes y Word se
// ven con el visor de la casa (FileViewLink; el Word desde el 19-10,
// decisión 46); Excel y ZIP se descargan.
//
// La misma pieza sirve para "Mi postulación" (sprint 3, paso 3; migración
// 127): lo que la empresa va a presentar, que después se valida contra el
// checklist de las bases. Ahí cada archivo lleva su sello si lo hizo la IA
// (sin firma) o si ya está firmado (paso 4, migración 129), y quien la usa
// puede sumar acciones por fila (Firmar) y algo al pie (MiPostulacion). Las
// acciones de la fila van también dentro del visor: se lee y se firma ahí.
// Desde el 26-10 (decisión 79) quien la usa puede poner su título, el estado
// de cada archivo a la izquierda y, bajo el nombre, lo que falta o hay que
// revisar («Tus documentos»).
//
// Más clara el 17-10 en la noche (Felipe: "vamos con todas"): un ícono por
// tipo de archivo, el nombre sin guiones bajos, «Descargar» en todos (y
// «Ver» en lo que se puede ver), la papelera más separada, y la lista
// plegada en una línea cuando ya hay análisis de las bases.

const ICONO_DEL_ARCHIVO: Record<ClaseDeArchivo, typeof File> = {
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  imagen: FileImage,
  otro: File,
};

export default function AdjuntosDeLaOportunidad({
  oportunidadId,
  seccion = "bases",
  accionesDeFila,
  pie,
  plegadaDePartida = false,
  filtrar,
  abrirAqui,
  titulo,
  descripcion,
  estadoDeFila,
  detalleDeFila,
}: {
  readonly oportunidadId: number;
  readonly seccion?: SeccionDeArchivos;
  readonly accionesDeFila?: (a: AdjuntoDeOportunidad) => ReactNode;
  readonly pie?: ReactNode;
  /** Con el análisis de las bases hecho, la lista parte plegada en una
   *  línea: lo importante pasa a ser lo que dicen las bases. */
  readonly plegadaDePartida?: boolean;
  /** Qué archivos se muestran (en «Mi postulación», sin el Word de lo ya
   *  firmado). Sin él, todos. */
  readonly filtrar?: (
    adjuntos: AdjuntoDeOportunidad[],
  ) => AdjuntoDeOportunidad[];
  /** Los que se abren en una pantalla propia en vez del visor («Abrir»: en
   *  «Mi postulación», el documento para verlo y editarlo, decisión 78).
   *  Devuelve cómo abrirlo, o nada para usar el visor. */
  readonly abrirAqui?: (a: AdjuntoDeOportunidad) => (() => void) | undefined;
  /** El título; sin él, «Mi postulación» o «Bases y anexos». */
  readonly titulo?: ReactNode;
  /** El texto bajo el título; sin él, el de cada sección. */
  readonly descripcion?: ReactNode;
  /** El estado de cada archivo, a la izquierda en vez de su ícono y de su
   *  sello («Tus documentos», decisión 79: firmado, por completar...). */
  readonly estadoDeFila?: (a: AdjuntoDeOportunidad) => {
    readonly label: string;
    readonly clases: string;
  };
  /** Lo que va bajo el nombre (lo que falta o hay que revisar). */
  readonly detalleDeFila?: (a: AdjuntoDeOportunidad) => ReactNode;
}) {
  const qc = useQueryClient();
  const clave = ["oportunidades", "adjuntos", oportunidadId, seccion];
  const { data: todos = [], isPending } = useQuery({
    queryKey: clave,
    queryFn: () => getAdjuntos(oportunidadId, seccion),
  });
  const adjuntos = filtrar ? filtrar(todos) : todos;

  const [subiendo, setSubiendo] = useState<{
    actual: number;
    total: number;
    nombre: string;
  } | null>(null);
  const [porBorrar, setPorBorrar] = useState<number | null>(null);
  // Lo que elija la persona manda; si no eligió, sigue a plegadaDePartida
  // (que llega cuando termina de cargar el análisis).
  const [eleccion, setEleccion] = useState<boolean | null>(null);
  const abierta = eleccion ?? !(plegadaDePartida && adjuntos.length > 0);
  const pesoTotal = adjuntos.reduce((suma, a) => suma + a.bytes, 0);

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

  // «Traer los documentos» (decisión 65, 21-10): lo que Licify tiene del
  // proceso llega solo a «Bases y anexos». Felipe: "un botón de bajar
  // documentos y que lo lleve directamente". Desde el 23-10 el «Trayendo…»
  // sale también del motor (`useEstadoDeTraer`): sigue a la vista al salir
  // y volver a la ficha, y la etapa Bases del camino gira mientras tanto.
  const trayendoEnElMotor = useEstadoDeTraer(
    oportunidadId,
    seccion === "bases",
  );
  const traer = useMutation({
    mutationFn: () => traerAdjuntos(oportunidadId),
    onMutate: () =>
      qc.setQueryData(claveDeTraer(oportunidadId), { trayendo: true }),
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: claveDeTraer(oportunidadId) }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: clave });
      if (r.disponibles === 0) {
        toast.warn(
          "Licify todavía no tiene los archivos de este proceso. Ábrelo con el enlace «Mercado Público» de arriba, bájalos y arrástralos aquí.",
        );
      } else if (r.bajados.length === 0) {
        toast.success("Ya estaban todos los archivos que tiene Licify.");
      } else {
        const n = r.bajados.length;
        const ya = r.omitidos.filter((o) => o.motivo === "ya estaba").length;
        toast.success(
          `${n === 1 ? "Llegó 1 archivo" : `Llegaron ${n} archivos`}${ya > 0 ? ` (${ya} ya ${ya === 1 ? "estaba" : "estaban"})` : ""}.`,
        );
      }
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudieron traer los documentos.")),
  });

  const trayendo = traer.isPending || trayendoEnElMotor;

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
      <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
        <div className="min-w-0 space-y-0.5 sm:flex-1">
          <h2 className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-gray-900">
            {titulo ??
              (seccion === "postulacion" ? "Mi postulación" : "Bases y anexos")}
            {adjuntos.length > 0 && (
              <button
                type="button"
                onClick={() => setEleccion(!abierta)}
                aria-expanded={abierta}
                className="inline-flex items-center gap-0.5 text-xs font-normal text-gray-500 hover:text-gray-800"
              >
                {abierta ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                {adjuntos.length === 1
                  ? "1 archivo"
                  : `${adjuntos.length} archivos`}{" "}
                · {tamanoLegible(pesoTotal)}
                {abierta ? "" : " · ver lista o agregar más"}
              </button>
            )}
          </h2>
          <p className={abierta ? "text-xs text-gray-500" : "hidden"}>
            {descripcion ??
              (seccion === "postulacion"
                ? "Lo que vas a presentar: anexos llenos y firmados, propuesta, oferta, certificados. Después valídalo contra lo que piden las bases."
                : "«Traer los documentos» baja solos los que publicó el comprador (bases, decretos, formularios). Si no están, ábrelo con el enlace «Mercado Público» de arriba, bájalos y arrástralos aquí.")}
          </p>
        </div>
        {seccion === "bases" && (
          // Quieto mientras trae (27-10). Felipe: "cuando pincho el botón
          // traer documentos, este baja para cargar... ¿puedes dejarlo
          // quieto?". El aviso iba antes y lo empujaba a la línea de abajo:
          // ahora va debajo, y el botón guarda el ancho del texto más largo.
          // Y siempre arriba a la derecha (28-10, "se pone a pensar este
          // botón se baja"): con la lista abierta, como parte una licitación
          // sin documentos, el texto explicativo lo echaba abajo a la
          // izquierda, y el aviso al aparecer lo corría. Ahora el texto se
          // acomoda a su lado y el aviso guarda su lugar aunque no se vea.
          <div className="flex flex-col items-end gap-1 sm:shrink-0">
            <button
              type="button"
              onClick={() => traer.mutate()}
              disabled={trayendo}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {trayendo ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <CloudDownload size={14} aria-hidden />
              )}
              <span className="grid">
                <span
                  aria-hidden={trayendo}
                  className={`col-start-1 row-start-1 ${trayendo ? "invisible" : ""}`}
                >
                  Traer los documentos
                </span>
                <span
                  aria-hidden={!trayendo}
                  className={`col-start-1 row-start-1 ${trayendo ? "" : "invisible"}`}
                >
                  Trayendo…
                </span>
              </span>
            </button>
            <span
              aria-hidden={!trayendo}
              className={`text-xs text-gray-500 ${trayendo ? "" : "invisible"}`}
            >
              Puedes salir de la ficha: aparecen solos al terminar.
            </span>
          </div>
        )}
      </div>

      {isPending ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : (
        abierta &&
        adjuntos.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {adjuntos.map((a) => {
              const estado = estadoDeFila?.(a);
              const sello = estado ? null : ORIGENES[a.origen];
              const abrir = abrirAqui?.(a);
              const clase = claseDeArchivo(a.nombre);
              const Icono =
                clase === "otro" && /\.(zip|rar|7z)$/i.test(a.nombre)
                  ? FileArchive
                  : ICONO_DEL_ARCHIVO[clase];
              return (
                <li
                  key={a.id}
                  className={`py-2 flex gap-3 ${estado ? "items-start" : "items-center"}`}
                >
                  {estado ? (
                    <span
                      className={`mt-0.5 w-24 shrink-0 px-1.5 py-0.5 text-center text-[11px] font-semibold rounded ${estado.clases}`}
                    >
                      {estado.label}
                    </span>
                  ) : (
                    <Icono
                      size={18}
                      className={`shrink-0 ${COLOR_DEL_ARCHIVO[clase]}`}
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className="flex items-center gap-2 text-sm text-gray-800"
                      title={a.nombre}
                    >
                      <span className="truncate">
                        {nombreLegible(a.nombre)}
                      </span>
                      {sello && (
                        <span
                          className={`shrink-0 px-1.5 py-0.5 text-[11px] font-semibold rounded ${sello.clases}`}
                        >
                          {sello.label}
                        </span>
                      )}
                    </p>
                    {detalleDeFila?.(a)}
                    <p className="text-xs text-gray-400">
                      {tamanoLegible(a.bytes)}
                      {a.quien?.full_name
                        ? ` · ${a.quien.full_name}`
                        : ""} · {formatMomento(a.creado_en, "diaHora")}
                      {a.editado_en &&
                        ` · editado en Eventia el ${formatMomento(a.editado_en, "diaHora")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {accionesDeFila?.(a)}
                    {abrir ? (
                      <button
                        type="button"
                        onClick={abrir}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Abrir
                      </button>
                    ) : (
                      seVeEnElVisor(a.ruta) && (
                        <FileViewLink
                          url={a.ruta}
                          title={a.nombre}
                          acciones={accionesDeFila?.(a)}
                        />
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => void descargar(a)}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                    >
                      Descargar
                    </button>
                    <span className="h-4 w-px bg-gray-200" aria-hidden="true" />
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
        } ${abierta || arrastrando || subiendo ? "" : "hidden"}`}
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
