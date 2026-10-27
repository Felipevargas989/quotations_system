import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
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
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import AlFinalDeLasBases from "./AlFinalDeLasBases";
import DocumentosAPresentar from "./DocumentosAPresentar";
import ExigenciasDeLaLicitacion from "./ExigenciasDeLaLicitacion";
import { exigenciasDe } from "./exigencias";
import Plegable from "./Plegable";
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
  pedidoAlProveedor,
  type Sello,
  selloDeLaExperiencia,
  selloDeLaIntegridad,
  selloDeLasExigencias,
  selloDeLosDocumentos,
} from "./relacionDeLasBases";
import TituloDeBloque from "./TituloDeBloque";
import { pedidoDeLosAnexos, precioDeLosAnexos } from "./postuladasDeAntes";
import { useChecklistDeDocumentos } from "./useChecklistDeDocumentos";
import { useGeneraciones } from "./useGeneraciones";
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
// portal; y 5 Pregúntale a la IA, abierto (Felipe: "debe ser el bloque 5 y
// más protagonista"). Al final, plegado, lo de consulta (AlFinalDeLasBases):
// el pedido al proveedor, lo que va al catálogo, los detalles, las fechas y
// las otras condiciones. Los cruces están en relacionDeLasBases.ts.

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

      {r && analisis ? (
        <Relacionado
          r={r}
          oportunidadId={oportunidadId}
          ficha={ficha}
          analizadoEl={analisis.creado_en}
          conBases={adjuntos.length > 0}
        />
      ) : (
        adjuntos.length > 0 && (
          <BloqueDePreguntas oportunidadId={oportunidadId} />
        )
      )}
    </>
  );
}

/** «Pregúntale a la IA» con protagonismo (Felipe, 26-10: "debe ser el
 *  bloque 5 y más protagonista"): abierto, con el cuadro para preguntar y
 *  las últimas respuestas a la vista. Sin análisis va sin número. */
function BloqueDePreguntas({
  oportunidadId,
  numero,
}: {
  readonly oportunidadId: number;
  readonly numero?: number;
}) {
  const titulo = "Pregúntale a la IA sobre estas bases";
  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">
        {numero ? (
          <TituloDeBloque numero={numero}>{titulo}</TituloDeBloque>
        ) : (
          titulo
        )}
      </h2>
      <PreguntasALaIA oportunidadId={oportunidadId} sinTitulo />
    </section>
  );
}

/** Los cuatro bloques, cada uno con lo que le dicen los otros; después,
 *  las preguntas a la IA (el 5) y lo plegado al final. */
function Relacionado({
  r,
  oportunidadId,
  ficha,
  analizadoEl,
  conBases,
}: {
  readonly r: ResultadoDeBases;
  readonly oportunidadId: number;
  readonly ficha: Pick<
    FichaDeOportunidad,
    "estado" | "exigencias_marcadas" | "proceso"
  >;
  readonly analizadoEl: string;
  /** Hay bases subidas: se le puede preguntar a la IA. */
  readonly conBases: boolean;
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
  // Una postulada antes de «Armar postulación» (19-10) no tiene oferta
  // armada: su precio y su pedido al proveedor quedaron en los anexos.
  const { data: generaciones } = useGeneraciones(oportunidadId);
  const total =
    (trabajo?.estado === "listo"
      ? trabajo.parametros?.postulacion?.total
      : undefined) ??
    cotizacion?.cotizacion?.total ??
    precioDeLosAnexos(generaciones) ??
    0;
  const pedido = trabajo
    ? pedidoAlProveedor(oferta)
    : pedidoDeLosAnexos(generaciones);
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
  // Decisión 93: en una compra ágil, por ley gana el menor precio.
  const compraAgil = ficha.proceso.tipo === "compra_agil";

  return (
    <>
      {(r.criterios.length > 0 || compraAgil) && (
        <Criterios criterios={r.criterios} vas={vas} compraAgil={compraAgil} />
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
        pedido={pedido.length}
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

      {conBases && (
        <BloqueDePreguntas oportunidadId={oportunidadId} numero={5} />
      )}

      <AlFinalDeLasBases r={r} oferta={oferta} cubre={cubre} pedido={pedido} />
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

/** En una compra ágil, por ley gana el menor precio (decisión 93, 27-10).
 *  Felipe: "me da la sensación de que quizás eso está normado por ley, que
 *  el precio más bajo". Lo está: Ley 19.886 modificada por la Ley 21.634 y
 *  artículo 97 del reglamento (Decreto 661). */
const LO_QUE_DICE_LA_LEY =
  "Si eligen otra cotización, tienen que justificarlo en la orden de compra. Por regla general compran a empresas de menor tamaño y proveedores locales. Lo fijan la Ley 19.886, modificada por la Ley 21.634, y el artículo 97 de su reglamento.";

/** Cómo te evalúan: una barra por criterio, del más pesado al más liviano,
 *  con cómo vas en cada uno, y el detalle de cada uno plegado. En una
 *  compra ágil, arriba, la regla de la ley; los criterios que agregue el
 *  comprador van debajo. */
function Criterios({
  criterios,
  vas,
  compraAgil = false,
}: {
  readonly criterios: ResultadoDeBases["criterios"];
  readonly vas: ComoVas;
  readonly compraAgil?: boolean;
}) {
  const ordenados = criteriosPorPeso(criterios);
  const delPrecio = compraAgil ? comoVasEn("Menor precio", vas) : null;
  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-2">
      <h2 className="text-sm font-semibold text-gray-900">
        <TituloDeBloque numero={1}>Cómo te evalúan</TituloDeBloque>
      </h2>
      {compraAgil && (
        <div className="space-y-0.5">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-semibold text-gray-900">
              Por ley, gana el menor precio
            </span>
            {delPrecio && <Sellito sello={delPrecio} />}
          </p>
          <p className="text-xs text-gray-600">{LO_QUE_DICE_LA_LEY}</p>
        </div>
      )}
      {compraAgil && ordenados.length > 0 && (
        <p className="pt-1 text-xs font-semibold text-gray-500">
          Lo que agrega el comprador
        </p>
      )}
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
      {ordenados.length > 0 && (
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
      )}
    </section>
  );
}
