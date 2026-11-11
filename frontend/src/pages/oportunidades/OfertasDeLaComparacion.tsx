import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import { useArrastreDeArchivos } from "../../hooks/useArrastreDeArchivos";
import {
  type ComparacionDeOfertas,
  type LecturaDeUnaOferta,
  subirOfertaDeCompetidor,
} from "../../services/comparacion.service";
import {
  type AdjuntoDeOportunidad,
  borrarAdjunto,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import IncumplimientosGraves from "./IncumplimientosGraves";
import Plegable from "./Plegable";
import TraerLasOfertas from "./TraerLasOfertas";
import {
  type OfertaEnDetalle,
  ofertasEnDetalle,
  resumenDeLectura,
} from "./lineasDeLaComparacion";
import { tamanoLegible } from "./oportunidades.utils";
import { claveDeLaCompetencia } from "./useTraerOfertas";

// LAS OFERTAS, UNA POR FILA (decisión 125 del doc 17, 11-11). Antes la
// pestaña partía con la lista de los 44 archivos de la competencia y seguía
// con una tarjeta de texto rojo por oferente. Ahora cada oferta es una fila
// que se abre: adentro, siempre en el mismo orden, lo que le suma, lo que le
// resta y lo que la puede dejar fuera (con su reclamo), el porqué de cada
// nota y sus archivos. Quien postula a dos líneas sale una sola vez, con lo
// de cada línea. Sin comparación todavía, las filas son «La competencia»:
// los archivos de cada oferente. Subir a mano y «Traer las ofertas» (sin
// comparar) siguen aquí.

const igual = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export default function OfertasDeLaComparacion({
  oportunidadId,
  resultado,
  porCompetidor,
  esLicitacion,
  adjudicada,
}: {
  readonly oportunidadId: number;
  /** La comparación, si ya hay una. */
  readonly resultado: ComparacionDeOfertas | null;
  /** Los archivos de «La competencia», por oferente. */
  readonly porCompetidor: ReadonlyMap<string, AdjuntoDeOportunidad[]>;
  readonly esLicitacion: boolean;
  readonly adjudicada: boolean;
}) {
  const detalle = resultado ? ofertasEnDetalle(resultado) : [];
  const conDetalle = new Set(
    [...porCompetidor.keys()].filter((quien) =>
      detalle.some((d) => !d.es_tuya && igual(d.nombre, quien)),
    ),
  );
  // Lo que llegó después de comparar, o lo de una comparación de antes, que
  // no sabía cómo se llamaba cada oferta en «La competencia».
  const sinDetalle = [...porCompetidor].filter(
    ([quien]) => !conDetalle.has(quien),
  );
  const archivosDe = (d: OfertaEnDetalle) =>
    d.es_tuya
      ? []
      : ([...porCompetidor].find(([quien]) => igual(quien, d.nombre))?.[1] ??
        []);
  const variasLineas = (resultado?.lineas.length ?? 0) > 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {detalle.length > 0
            ? "El detalle de cada oferta"
            : `La competencia (${porCompetidor.size})`}
        </h3>
        {esLicitacion && (
          <TraerLasOfertas oportunidadId={oportunidadId} secundario />
        )}
      </div>

      {(detalle.length > 0 || sinDetalle.length > 0) && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {detalle.map((d) => {
            const archivos = archivosDe(d);
            return (
              <Fila
                key={d.clave}
                titulo={`${d.nombre}${d.es_tuya ? " (tú)" : ""}`}
                tuya={d.es_tuya}
                alLado={
                  d.lectura
                    ? resumenDeLectura(d.lectura)
                    : cuantos(archivos.length)
                }
              >
                {d.enLineas.length === 0 && (
                  <p className="text-sm text-gray-600">
                    No se pudo leer nada de esta oferta: no entró a la
                    comparación.
                  </p>
                )}
                {d.enLineas.map(({ linea, oferente }) => (
                  <div key={linea.nombre} className="space-y-2">
                    {variasLineas && (
                      <p className="text-xs font-semibold text-gray-500">
                        {linea.nombre}
                      </p>
                    )}
                    <div className="grid gap-3 md:grid-cols-3">
                      <Columna
                        titulo="Le suma"
                        clases="bg-green-100 text-green-800"
                        cosas={oferente.fortalezas}
                      />
                      <Columna
                        titulo="Le resta"
                        clases="bg-amber-100 text-amber-800"
                        cosas={oferente.debilidades}
                      />
                      <IncumplimientosGraves
                        oferente={oferente}
                        adjudicada={adjudicada}
                      />
                    </div>
                    {oferente.por_que && (
                      <p className="text-xs text-gray-600">
                        {oferente.por_que}
                      </p>
                    )}
                    <Plegable titulo="Por qué cada nota">
                      <ul className="space-y-0.5 text-xs text-gray-600">
                        {oferente.notas.map((n) => (
                          <li key={n.criterio}>
                            <span className="font-semibold">
                              {resultado?.criterios[n.criterio - 1]?.nombre ??
                                `Criterio ${n.criterio}`}
                              :
                            </span>{" "}
                            {n.nota} · {n.fundamento}
                          </li>
                        ))}
                      </ul>
                    </Plegable>
                  </div>
                ))}
                {d.lectura && <LoQueNoVio lectura={d.lectura} />}
                {archivos.length > 0 && (
                  <Plegable titulo={`Sus archivos (${archivos.length})`}>
                    <Archivos
                      oportunidadId={oportunidadId}
                      archivos={archivos}
                    />
                  </Plegable>
                )}
              </Fila>
            );
          })}
          {sinDetalle.map(([quien, archivos]) => (
            <Fila
              key={`competencia:${quien}`}
              titulo={quien}
              tuya={false}
              alLado={cuantos(archivos.length)}
              abierta={detalle.length === 0}
            >
              <Archivos oportunidadId={oportunidadId} archivos={archivos} />
            </Fila>
          ))}
        </ul>
      )}

      {/* En una compra ágil es la única manera: viene abierto. */}
      <SubirAMano oportunidadId={oportunidadId} abierto={!esLicitacion} />
    </div>
  );
}

const cuantos = (n: number): string =>
  n === 1 ? "1 archivo" : `${n} archivos`;

/** Una oferta: su nombre, lo que se leyó de ella y, al abrirla, lo suyo. */
function Fila({
  titulo,
  tuya,
  alLado,
  abierta = false,
  children,
}: {
  readonly titulo: string;
  readonly tuya: boolean;
  readonly alLado: string;
  readonly abierta?: boolean;
  readonly children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(abierta);
  return (
    <li className="p-3 space-y-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
      >
        <span
          className={`inline-flex items-center gap-1 text-sm font-semibold ${tuya ? "text-blue-700" : "text-gray-900"}`}
        >
          {abierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          {titulo}
        </span>
        <span className="text-xs text-gray-500">{alLado}</span>
      </button>
      {abierto && <div className="space-y-3">{children}</div>}
    </li>
  );
}

function Columna({
  titulo,
  clases,
  cosas,
}: {
  readonly titulo: string;
  readonly clases: string;
  readonly cosas: readonly string[];
}) {
  return (
    <div className="space-y-1.5">
      <span
        className={`inline-block px-1.5 py-0.5 text-xs font-semibold rounded ${clases}`}
      >
        {titulo}
      </span>
      {cosas.length === 0 ? (
        <p className="text-sm text-gray-500">Nada a la vista</p>
      ) : (
        <ul className="space-y-1 text-sm text-gray-900">
          {cosas.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Lo que la IA no vio de una oferta: de eso no afirma nada. */
function LoQueNoVio({ lectura }: { readonly lectura: LecturaDeUnaOferta }) {
  if (lectura.sin_leer.length + lectura.sin_traer.length === 0) return null;
  const lista = (xs: Array<{ nombre: string; motivo: string }>) =>
    xs.map((x) => `${x.nombre} (${x.motivo})`).join("; ");
  return (
    <div className="space-y-0.5 text-xs text-amber-800">
      {lectura.sin_traer.length > 0 && (
        <p>Sin traer de Mercado Público: {lista(lectura.sin_traer)}.</p>
      )}
      {lectura.sin_leer.length > 0 && (
        <p>Sin leer: {lista(lectura.sin_leer)}.</p>
      )}
    </div>
  );
}

/** Los archivos de un oferente, con su peso y el botón de eliminar. */
function Archivos({
  oportunidadId,
  archivos,
}: {
  readonly oportunidadId: number;
  readonly archivos: readonly AdjuntoDeOportunidad[];
}) {
  const qc = useQueryClient();
  const [borrando, setBorrando] = useState<number | null>(null);
  const borrar = useMutation({
    mutationFn: (adjuntoId: number) => borrarAdjunto(oportunidadId, adjuntoId),
    onSuccess: () => {
      setBorrando(null);
      void qc.invalidateQueries({
        queryKey: claveDeLaCompetencia(oportunidadId),
      });
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo eliminar.")),
  });
  return (
    <ul className="space-y-1">
      {archivos.map((a) => (
        <li
          key={a.id}
          className="flex flex-wrap items-center gap-2 text-sm text-gray-700"
        >
          <span className="min-w-0 break-all">{a.nombre}</span>
          <span className="text-xs text-gray-400">
            {tamanoLegible(a.bytes)}
          </span>
          {borrando === a.id ? (
            <ConfirmInline
              question="¿Eliminar este archivo?"
              onYes={() => borrar.mutate(a.id)}
              onNo={() => setBorrando(null)}
              busy={borrar.isPending}
            />
          ) : (
            <button
              type="button"
              onClick={() => setBorrando(a.id)}
              aria-label={`Eliminar ${a.nombre}`}
              className="text-gray-400 hover:text-red-600"
            >
              <Trash2 size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Sumar a mano la oferta de un competidor: su nombre y sus archivos. En
 *  una compra ágil es la única manera; en una licitación, para lo que el
 *  cuadro de ofertas no trae. */
function SubirAMano({
  oportunidadId,
  abierto,
}: {
  readonly oportunidadId: number;
  readonly abierto: boolean;
}) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const elegir = useRef<HTMLInputElement>(null);
  const refrescar = () =>
    qc.invalidateQueries({ queryKey: claveDeLaCompetencia(oportunidadId) });
  const subir = useMutation({
    mutationFn: async (archivos: File[]) => {
      for (const a of archivos) {
        await subirOfertaDeCompetidor(oportunidadId, a, nombre.trim());
      }
      return archivos.length;
    },
    onSuccess: (n) => {
      toast.success(n === 1 ? "Archivo subido." : `${n} archivos subidos.`);
      void refrescar();
    },
    onError: (e) => {
      toast.error(humanizeApiError(e, "No se pudo subir."));
      void refrescar();
    },
  });
  const sinNombre = nombre.trim() === "";
  const recibir = (archivos: File[]) => {
    if (sinNombre) {
      toast.error("Escribe primero de qué oferente es la oferta.");
      return;
    }
    subir.mutate(archivos);
  };
  const { arrastrando, zona } = useArrastreDeArchivos(recibir, {
    desactivado: subir.isPending,
  });
  return (
    <Plegable titulo="Subir una oferta a mano" abierto={abierto}>
      <div
        {...zona}
        className={`p-4 rounded-lg border-2 border-dashed space-y-2 ${
          arrastrando ? "border-blue-400 bg-blue-50" : "border-gray-200"
        }`}
      >
        <label className="block text-xs font-semibold text-gray-600">
          De qué oferente es la oferta
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Por ejemplo, Sol de Quillón SpA"
            maxLength={200}
            className="mt-1 w-full px-3 py-2 text-sm font-normal text-gray-900 border border-gray-300 rounded-lg"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => elegir.current?.click()}
            disabled={sinNombre || subir.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {subir.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            Elegir sus archivos
          </button>
          <p className="text-xs text-gray-500">
            o arrástralos aquí · PDF, Word o fotos, hasta 30 MB cada uno
          </p>
        </div>
        <input
          ref={elegir}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const archivos = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (archivos.length > 0) recibir(archivos);
          }}
        />
      </div>
    </Plegable>
  );
}
