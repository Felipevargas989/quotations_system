import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "../../components/toast/Toast";
import { getExperiencia } from "../../services/experiencia.service";
import {
  type FichaDeOportunidad,
  getAdjuntos,
  getAnalisis,
  getCotizacionDeLaPostulacion,
  pedirAnalisis,
  type ResultadoDeBases,
} from "../../services/oportunidades.service";
import { getOfertaDeLaPostulacion } from "../../services/postulacion.service";
import { getPreguntas } from "../../services/preguntas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import DocumentosAPresentar from "./DocumentosAPresentar";
import ExigenciasDeLaLicitacion from "./ExigenciasDeLaLicitacion";
import { exigenciasDe } from "./exigencias";
import PreguntasALaIA from "./PreguntasALaIA";
import {
  alertasDelAnalisis,
  criteriosPorPeso,
  pesoComoNumero,
  textoDeCosto,
} from "./oportunidades.utils";
import { claveDeLaCotizacion, veredicto } from "./precioDeLaPostulacion";
import { claveDeLaExperiencia } from "./reglasDeLaExperiencia";
import {
  CLASES_DEL_TONO,
  type ComoVas,
  comoVasEn,
  estadoDeExigencia,
  estadoDeLoQueTeDejaFuera,
  ofertaDeCadaExigencia,
  type Sello,
  selloDeLaExperiencia,
  selloDeLaIntegridad,
  selloDeLasExigencias,
  selloDeLosDocumentos,
} from "./relacionDeLasBases";
import TituloDeBloque from "./TituloDeBloque";
import { useChecklistDeDocumentos } from "./useChecklistDeDocumentos";
import { claveDeLaOferta } from "./vueltaDeLaPostulacion";

// LA IA LEE LAS BASES (doc 17, sprint 3, paso 1). El botón manda las bases y
// anexos subidos a Opus 5.5. El análisis corre por detrás (uno a tres
// minutos) y la pantalla pregunta cada 5 segundos.
//
// Ordenado el 17-10 (Felipe: "quedó muy desordenado... difícil de leer"):
// cómo te evalúan (barras por peso: "destacar criterios es importante"),
// lo que te deja fuera arriba (máximo 5), lo demás plegado, una sola lista
// de lo que hay que presentar con el estado de la validación al lado, y las
// fechas clave. Presupuesto, fecha del evento y lugar suben a "en una
// mirada", arriba de la ficha.
//
// Reordenado el 19-10 (Felipe: "lo que pide la licitación con el listado de
// documentos"): resumen, cómo te evalúan, lo que te deja fuera, los
// formularios, las EXIGENCIAS (con ✓ lo tengo / ✗ no puedo) y los
// DOCUMENTOS A PRESENTAR (cruzados con tu carpeta); después las fechas.
// «¿Puedo cumplir?» y la lista mezclada de lo que hay que presentar se
// juntaron en esas dos.
//
// Relacionado el 26-10 (decisión 80; Felipe: "para que estén relacionados y
// sirva al propósito"): cuatro bloques que se responden entre sí. 1 Cómo te
// evalúan, con cómo vas en cada criterio; 2 Lo que te deja fuera, cada causa
// con su estado; 3 Lo que tienes que ofrecer, cada exigencia con un solo
// estado y cómo la ofreces; 4 Lo que tienes que presentar, por parte del
// portal. Las fechas, las otras condiciones y las preguntas van plegadas al
// final. Los cruces están en relacionDeLasBases.ts.

export default function AnalisisDeBases({
  oportunidadId,
  ficha,
}: {
  readonly oportunidadId: number;
  readonly ficha: Pick<
    FichaDeOportunidad,
    "estado" | "exigencias_marcadas" | "proceso"
  >;
}) {
  const qc = useQueryClient();
  const clave = ["oportunidades", "analisis", oportunidadId];
  const { data: adjuntos = [] } = useQuery({
    queryKey: ["oportunidades", "adjuntos", oportunidadId, "bases"],
    queryFn: () => getAdjuntos(oportunidadId, "bases"),
  });
  const { data: analisis, isPending } = useQuery({
    queryKey: clave,
    queryFn: () => getAnalisis(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.estado === "procesando" ? 5000 : false,
  });

  const pedir = useMutation({
    mutationFn: () => pedirAnalisis(oportunidadId),
    onSuccess: (fila) => qc.setQueryData(clave, fila),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo pedir el análisis.")),
  });

  const procesando = analisis?.estado === "procesando" || pedir.isPending;
  const r = analisis?.estado === "listo" ? analisis.resultado : null;

  return (
    <>
      <section className="bg-white rounded-lg shadow p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-sm font-semibold text-gray-900">
              Análisis de las bases
            </h2>
            <p className="text-xs text-gray-500">
              La IA lee las bases y anexos que subiste. La IA propone; revisa
              siempre las bases.
            </p>
          </div>
          <button
            type="button"
            onClick={() => pedir.mutate()}
            disabled={procesando || adjuntos.length === 0}
            title={adjuntos.length === 0 ? "Sube primero las bases" : undefined}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {procesando ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {r || analisis?.estado === "error"
              ? "Volver a analizar"
              : "Analizar bases con IA"}
          </button>
        </div>

        {isPending ? (
          <p className="text-sm text-gray-500">Cargando…</p>
        ) : procesando ? (
          <p className="text-sm text-gray-600">
            Leyendo las bases… suele tardar entre 1 y 3 minutos. Puedes seguir
            en otra pantalla.
          </p>
        ) : analisis?.estado === "error" ? (
          <p className="text-sm text-red-600">{analisis.error}</p>
        ) : !r ? (
          <p className="text-sm text-gray-500">
            {adjuntos.length === 0
              ? "Sube las bases (arriba) y después analízalas."
              : "Todavía no se analizan."}
          </p>
        ) : (
          r.resumen && <p className="text-sm text-gray-800">{r.resumen}</p>
        )}

        {analisis && analisis.estado !== "procesando" && (
          <p className="text-xs text-gray-400">
            {analisis.estado === "listo" ? "Analizado" : "Intentado"} el{" "}
            {formatMomento(
              analisis.terminado_en ?? analisis.creado_en,
              "diaHora",
            )}
            {analisis.modelo ? ` con ${analisis.modelo}` : ""}
            {analisis.archivos.length > 0 &&
              ` · leyó ${analisis.archivos.length} ${analisis.archivos.length === 1 ? "archivo" : "archivos"}`}
            {analisis.costo_usd != null &&
              ` · costó ${textoDeCosto(analisis.costo_usd)}`}
            {analisis.no_leidos.length > 0 &&
              ` · no leyó: ${analisis.no_leidos.map((n) => `${n.nombre} (${n.motivo})`).join("; ")}`}
          </p>
        )}
      </section>

      {r && analisis && (
        <Relacionado
          r={r}
          oportunidadId={oportunidadId}
          ficha={ficha}
          analizadoEl={analisis.creado_en}
        />
      )}

      {(r || adjuntos.length > 0) && (
        <AlFinal
          r={r}
          oportunidadId={oportunidadId}
          conBases={adjuntos.length > 0}
        />
      )}
    </>
  );
}

/** Los cuatro bloques, cada uno con lo que le dicen los otros. */
function Relacionado({
  r,
  oportunidadId,
  ficha,
  analizadoEl,
}: {
  readonly r: ResultadoDeBases;
  readonly oportunidadId: number;
  readonly ficha: Pick<
    FichaDeOportunidad,
    "estado" | "exigencias_marcadas" | "proceso"
  >;
  readonly analizadoEl: string;
}) {
  const filas = useChecklistDeDocumentos(
    oportunidadId,
    r,
    ficha.proceso.fecha_cierre ?? null,
  );
  const { data: trabajo } = useQuery({
    queryKey: claveDeLaOferta(oportunidadId),
    queryFn: () => getOfertaDeLaPostulacion(oportunidadId),
  });
  const { data: cotizacion } = useQuery({
    queryKey: claveDeLaCotizacion(oportunidadId),
    queryFn: () => getCotizacionDeLaPostulacion(oportunidadId),
  });
  const { data: experiencia } = useQuery({
    queryKey: claveDeLaExperiencia(oportunidadId),
    queryFn: () => getExperiencia(oportunidadId),
  });

  const oferta = trabajo?.estado === "listo" ? trabajo.resultado : null;
  const marcas = ficha.exigencias_marcadas ?? {};
  const exigencias = exigenciasDe(r);
  const cubre = ofertaDeCadaExigencia(exigencias, oferta?.matriz ?? []);
  const estados = new Map(
    exigencias.map((e) => [
      e.clave,
      estadoDeExigencia(e, marcas[e.clave], cubre.get(e.clave)),
    ]),
  );
  // El precio, como en «El precio» de «Mi postulación».
  const total =
    (trabajo?.estado === "listo"
      ? trabajo.parametros?.postulacion?.total
      : undefined) ??
    cotizacion?.cotizacion?.total ??
    0;
  const dice = veredicto(cotizacion?.presupuesto ?? null, total);
  const precio: Sello | null = dice
    ? { tono: dice.tono === "calza" ? "bien" : "mal", texto: dice.corto }
    : null;
  const elegida =
    experiencia?.trabajo?.estado === "listo"
      ? experiencia.trabajo.resultado
      : null;
  const vas: ComoVas = {
    precio,
    experiencia: selloDeLaExperiencia(
      experiencia
        ? {
            piden: experiencia.piden,
            confirmada: Boolean(elegida?.confirmada),
            contratos:
              elegida?.elegidas.filter((e) => e.con_respaldo).length ?? 0,
            pide: elegida?.pide ?? 0,
          }
        : null,
    ),
    exigencias: selloDeLasExigencias([...estados.values()]),
    documentos: selloDeLosDocumentos(filas),
    integridad: selloDeLaIntegridad(filas),
  };
  const { dejanFuera } = alertasDelAnalisis(r);

  return (
    <>
      {r.criterios.length > 0 && (
        <Criterios criterios={r.criterios} vas={vas} />
      )}

      {dejanFuera.length > 0 && (
        <section className="bg-white rounded-lg shadow p-5 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">
            <TituloDeBloque numero={2}>Lo que te deja fuera</TituloDeBloque>
          </h2>
          <ul className="divide-y divide-red-100 rounded-lg border border-red-200 bg-red-50/40">
            {dejanFuera.map((a, i) => {
              const sello = estadoDeLoQueTeDejaFuera(a, {
                filas,
                precio,
                exigencias: vas.exigencias,
              });
              return (
                <li
                  key={i}
                  className="px-3 py-2 flex flex-wrap items-start justify-between gap-3"
                >
                  <p className="min-w-0 flex-1 text-sm text-red-900">{a}</p>
                  {sello && <Sellito sello={sello} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ExigenciasDeLaLicitacion
        oportunidadId={oportunidadId}
        exigencias={exigencias}
        estados={estados}
        cubre={cubre}
        oferta={oferta}
        ofertaVieja={Boolean(
          oferta &&
            trabajo &&
            Date.parse(trabajo.creado_en) < Date.parse(analizadoEl),
        )}
        marcas={marcas}
        postulada={["postulada", "ganada"].includes(ficha.estado)}
      />

      <DocumentosAPresentar
        filas={filas}
        sinChecklist={!r.documentos?.length}
      />
    </>
  );
}

function Sellito({ sello }: { readonly sello: Sello }) {
  return (
    <span
      title={sello.texto}
      className={`inline-block max-w-full truncate shrink-0 px-2 py-0.5 text-xs font-semibold rounded ${CLASES_DEL_TONO[sello.tono]}`}
    >
      {sello.texto}
    </span>
  );
}

/** Cómo te evalúan: una barra por criterio, del más pesado al más liviano,
 *  con cómo vas en cada uno, y el detalle de cada uno plegado. */
function Criterios({
  criterios,
  vas,
}: {
  readonly criterios: ResultadoDeBases["criterios"];
  readonly vas: ComoVas;
}) {
  const ordenados = criteriosPorPeso(criterios);
  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-2">
      <h2 className="text-sm font-semibold text-gray-900">
        <TituloDeBloque numero={1}>Cómo te evalúan</TituloDeBloque>
      </h2>
      <ul className="space-y-1.5">
        {ordenados.map((c, i) => {
          const peso = pesoComoNumero(c.peso);
          const sello = comoVasEn(c.nombre, vas);
          return (
            <li
              key={`${c.nombre}-${i}`}
              className="grid grid-cols-[minmax(0,16rem)_minmax(0,1fr)_3.5rem_minmax(0,14rem)] items-center gap-3 text-sm"
            >
              <span className="truncate text-gray-900" title={c.nombre}>
                {c.nombre}
              </span>
              <span className="h-2 rounded bg-gray-100">
                <span
                  className="block h-2 rounded bg-blue-600"
                  style={{ width: `${Math.min(100, Math.max(0, peso))}%` }}
                />
              </span>
              <span className="text-right font-bold text-gray-900">
                {c.peso || "—"}
              </span>
              <span className="min-w-0">
                {sello && <Sellito sello={sello} />}
              </span>
            </li>
          );
        })}
      </ul>
      <Plegable titulo="Ver cómo se calcula cada uno">
        <dl className="space-y-1.5 text-sm">
          {ordenados.map((c, i) => (
            <div key={`${c.nombre}-${i}`}>
              <dt className="font-medium text-gray-900">
                {c.nombre}
                {c.peso && ` (${c.peso})`}
              </dt>
              <dd className="text-gray-600">{c.como_se_evalua || "—"}</dd>
            </div>
          ))}
        </dl>
      </Plegable>
    </section>
  );
}

/** Lo de consulta, plegado: las fechas y garantías, las otras condiciones
 *  y las preguntas a la IA. */
function AlFinal({
  r,
  oportunidadId,
  conBases,
}: {
  readonly r: ResultadoDeBases | null;
  readonly oportunidadId: number;
  readonly conBases: boolean;
}) {
  const { data: hilo = [] } = useQuery({
    queryKey: ["oportunidades", "preguntas", oportunidadId],
    queryFn: () => getPreguntas(oportunidadId),
    enabled: conBases,
  });
  const { condiciones, separadas } = r
    ? alertasDelAnalisis(r)
    : { condiciones: [], separadas: true };
  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-3">
      {r && (r.fechas.length > 0 || r.garantias.length > 0) && (
        <Plegable titulo="Fechas clave y garantías">
          {r.fechas.length > 0 && (
            <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {r.fechas.map((f, i) => (
                <div key={i} className="p-2 rounded-lg bg-gray-50">
                  <dt className="text-xs text-gray-500">{f.que}</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {f.cuando}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {r.garantias.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
              {r.garantias.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          )}
        </Plegable>
      )}
      {condiciones.length > 0 && (
        <Plegable
          titulo={
            separadas
              ? `Otras condiciones (${condiciones.length}): multas, pago, subcontratación…`
              : `Avisos (${condiciones.length}). Vuelve a analizar para separar lo que te deja fuera.`
          }
        >
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
            {condiciones.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Plegable>
      )}
      {conBases && (
        <Plegable
          titulo={`Pregúntale a la IA sobre estas bases${hilo.length > 0 ? ` (${hilo.length})` : ""}`}
          abierto={hilo.some((p) => p.estado === "procesando")}
        >
          <PreguntasALaIA oportunidadId={oportunidadId} plegada />
        </Plegable>
      )}
    </section>
  );
}

function Plegable({
  titulo,
  abierto: deEntrada = false,
  children,
}: {
  readonly titulo: string;
  /** Abierto de partida (una pregunta que la IA está respondiendo). */
  readonly abierto?: boolean;
  readonly children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(deEntrada);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
      >
        {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {titulo}
      </button>
      {abierto && children}
    </div>
  );
}
