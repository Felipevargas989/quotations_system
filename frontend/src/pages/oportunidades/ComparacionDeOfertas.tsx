import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Scale, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "../../components/toast/Toast";
import {
  getComparacion,
  pedirComparacion,
  type TrabajoDeComparacion,
} from "../../services/comparacion.service";
import {
  type AdjuntoDeOportunidad,
  getAdjuntos,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import AprenderDelActa from "./AprenderDelActa";
import LineaDeLaComparacion from "./LineaDeLaComparacion";
import OfertasDeLaComparacion from "./OfertasDeLaComparacion";
import Plegable from "./Plegable";
import PorQuePerdimos from "./PorQuePerdimos";
import { conLineas, lineasEnOrden } from "./lineasDeLaComparacion";
import { textoDeCosto } from "./oportunidades.utils";
import { claveDeLaCompetencia } from "./useTraerOfertas";

// LA COMPARACIÓN DE OFERTAS (decisión 41 del doc 17, 19-10). Felipe: "para
// poder descargar toda la información que haya subido otro posible
// competidor y analizar la probabilidad de quién se va a adjudicar la
// licitación en base a los criterios de evaluación... cargamos ambas
// ofertas, la mía va a salir de acá, la otra la descargo y la sumo". La IA
// pone la nota de cada criterio y el motor calcula los puntajes con los
// pesos de las bases. Desde la decisión 59, lo que puede dejar fuera a cada
// oferta y, en la de un competidor, el reclamo para el Centro de Ayuda.
//
// POR LÍNEA Y CON LOS NÚMEROS ADELANTE (decisión 125, 11-11). Felipe, con la
// 5040-14-LE26: "recuerda que son dos líneas que se podrían postular de
// forma independiente", "¿traer ofertas y luego comparar con IA debería ser
// un solo botón?" y, viendo la pantalla de antes, "debemos mejorar esta
// interfaz"; con la maqueta: "mucho mejor, hazlo así".
//  - Un botón: en una licitación, «Traer y comparar» trae lo que falte del
//    cuadro de ofertas de Mercado Público y compara. En una compra ágil, las
//    ofertas se suben a mano y el botón es «Comparar con IA».
//  - Una tarjeta por línea (`LineaDeLaComparacion`): solo quienes postulan a
//    ella, su puntaje y su precio, y quién gana si la comisión acepta todo o
//    si aplica las bases a la letra. La línea en que compites, primero.
//  - Cada oferta en una fila que se abre (`OfertasDeLaComparacion`), con sus
//    archivos adentro. Lo demás, plegado al final.

const claveDeLaComparacion = (id: number) => [
  "oportunidades",
  "comparacion",
  id,
];

export default function ComparacionDeOfertas({
  oportunidadId,
  adjudicada,
  perdida = false,
  esLicitacion = false,
}: {
  readonly oportunidadId: number;
  /** Ya adjudicada: no se ofrece el reclamo, sino el camino del Tribunal. */
  readonly adjudicada: boolean;
  /** Perdida: debajo de la predicción, por qué perdimos (decisión 97). */
  readonly perdida?: boolean;
  /** Una licitación tiene cuadro de ofertas público: las ofertas de los
   *  demás se traen solas (decisiones 123 y 125). Una compra ágil no trae
   *  documentos. */
  readonly esLicitacion?: boolean;
}) {
  const qc = useQueryClient();
  const { data: competencia = [] } = useQuery({
    queryKey: claveDeLaCompetencia(oportunidadId),
    queryFn: () => getAdjuntos(oportunidadId, "competencia"),
  });
  const { data: mias = [], isSuccess: yaSeSabeLoMio } = useQuery({
    queryKey: ["oportunidades", "adjuntos", oportunidadId, "postulacion"],
    queryFn: () => getAdjuntos(oportunidadId, "postulacion"),
  });
  const { data: trabajo, dataUpdatedAt } = useQuery({
    queryKey: claveDeLaComparacion(oportunidadId),
    queryFn: () => getComparacion(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.estado === "procesando" ? 5000 : false,
  });

  const comparar = useMutation({
    mutationFn: () => pedirComparacion(oportunidadId),
    onSuccess: (fila) =>
      qc.setQueryData(claveDeLaComparacion(oportunidadId), fila),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo pedir la comparación.")),
  });

  // Mientras trae y compara, las ofertas van llegando a «La competencia»: la
  // lista se pide de nuevo con cada respuesta, y una vez más al terminar.
  const veniaProcesando = useRef(false);
  useEffect(() => {
    const procesa = trabajo?.estado === "procesando";
    if (procesa || veniaProcesando.current) {
      void qc.invalidateQueries({
        queryKey: claveDeLaCompetencia(oportunidadId),
      });
    }
    veniaProcesando.current = procesa;
  }, [trabajo?.estado, dataUpdatedAt, oportunidadId, qc]);

  const procesando = trabajo?.estado === "procesando" || comparar.isPending;
  const r =
    trabajo?.estado === "listo" && trabajo.resultado
      ? conLineas(trabajo.resultado)
      : null;
  const porCompetidor = new Map<string, AdjuntoDeOportunidad[]>();
  for (const a of competencia) {
    const quien = a.competidor?.trim() || "Sin nombre";
    porCompetidor.set(quien, [...(porCompetidor.get(quien) ?? []), a]);
  }
  const sinQueComparar = !esLicitacion && competencia.length === 0;

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72 space-y-0.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Scale size={15} /> Comparación de ofertas
          </h2>
          <Estado
            trabajo={trabajo ?? null}
            procesando={procesando}
            esLicitacion={esLicitacion}
          />
        </div>
        <button
          type="button"
          onClick={() => comparar.mutate()}
          disabled={procesando || sinQueComparar}
          title={
            sinQueComparar
              ? "Sube primero la oferta de al menos un competidor"
              : undefined
          }
          className="inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {procesando ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {esLicitacion
            ? "Traer y comparar"
            : r || trabajo?.estado === "error"
              ? "Volver a comparar"
              : "Comparar con IA"}
        </button>
      </div>

      {yaSeSabeLoMio && mias.length === 0 && (
        <p className="text-sm text-amber-800">
          Todavía no hay nada en «Mi postulación»: arma o sube lo que
          presentaste, que es lo que se compara.
        </p>
      )}
      {trabajo?.estado === "error" && (
        <p className="text-sm text-red-600">{trabajo.error}</p>
      )}

      {r &&
        lineasEnOrden(r).map((linea) => (
          <LineaDeLaComparacion
            key={linea.nombre}
            linea={linea}
            criterios={r.criterios}
            adjudicada={adjudicada}
            unica={r.lineas.length === 1 && linea.nombre === ""}
          />
        ))}

      <OfertasDeLaComparacion
        oportunidadId={oportunidadId}
        resultado={r}
        porCompetidor={porCompetidor}
        esLicitacion={esLicitacion}
        adjudicada={adjudicada}
      />

      {r && trabajo && (
        <div className="space-y-2">
          {r.resumen && (
            <Plegable titulo="El resumen de la IA">
              <p className="text-sm text-gray-800">{r.resumen}</p>
            </Plegable>
          )}
          {r.para_la_proxima.length > 0 && (
            <Plegable titulo={`Para la próxima (${r.para_la_proxima.length})`}>
              <ul className="list-disc pl-5 text-sm text-gray-800 space-y-0.5">
                {r.para_la_proxima.map((cosa) => (
                  <li key={cosa}>{cosa}</li>
                ))}
              </ul>
            </Plegable>
          )}
          {trabajo.no_leidos.length > 0 && (
            <Plegable
              titulo={`Lo que la IA no leyó (${trabajo.no_leidos.length})`}
            >
              <ul className="text-xs text-gray-600 space-y-0.5">
                {trabajo.no_leidos.map((n) => (
                  <li key={n.nombre}>
                    {n.nombre} · {n.motivo}
                  </li>
                ))}
              </ul>
            </Plegable>
          )}
        </div>
      )}

      {perdida && <PorQuePerdimos oportunidadId={oportunidadId} />}
      <AprenderDelActa oportunidadId={oportunidadId} />
    </section>
  );
}

/** La línea chica bajo el título: qué hace el botón, cómo va o cuándo se
 *  comparó, cuánto leyó y cuánto costó. */
function Estado({
  trabajo,
  procesando,
  esLicitacion,
}: {
  readonly trabajo: TrabajoDeComparacion | null;
  readonly procesando: boolean;
  readonly esLicitacion: boolean;
}) {
  if (procesando) {
    return (
      <p className="text-xs text-gray-600">
        {esLicitacion
          ? "Trayendo las ofertas y comparando… suele tardar entre 3 y 6 minutos."
          : "La IA está leyendo las ofertas… suele tardar entre 2 y 5 minutos."}{" "}
        Puedes seguir en otra pantalla.
      </p>
    );
  }
  if (!trabajo) {
    return (
      <p className="text-xs text-gray-500">
        {esLicitacion
          ? "Trae del cuadro de ofertas de Mercado Público lo que presentaron los demás y lo compara con tu oferta, línea por línea, con los criterios y el texto de las bases."
          : "Sube lo que presentaron los demás, con el nombre de cada oferente, y la IA lo compara con tu oferta según los criterios de evaluación."}
      </p>
    );
  }
  const leidos = trabajo.archivos.length;
  const total = leidos + trabajo.no_leidos.length;
  return (
    <p className="text-xs text-gray-500">
      {trabajo.estado === "listo" ? "Comparado" : "Intentado"} el{" "}
      {formatMomento(trabajo.terminado_en ?? trabajo.creado_en, "diaHora")}
      {trabajo.estado === "listo" &&
        total > 0 &&
        ` · leyó ${leidos} de ${total} ${total === 1 ? "archivo" : "archivos"}`}
      {trabajo.costo_usd != null &&
        ` · costó ${textoDeCosto(trabajo.costo_usd)}`}
    </p>
  );
}
