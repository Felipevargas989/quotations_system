import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "../../components/toast/Toast";
import {
  type CandidataDeExperiencia,
  confirmarExperiencia,
  type EstadoDeLaExperiencia,
  getExperiencia,
  proponerExperiencia,
  type TrabajoDeExperiencia,
} from "../../services/experiencia.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatCurrency } from "../../utils/currencies";
import { claveDeLaExperiencia } from "./reglasDeLaExperiencia";

// «LA EXPERIENCIA» (decisión 76 del doc 17, 24-10): antes de armar, la IA
// propone la experiencia según las bases, de «Mi empresa» primero y de
// Eventia después, y la empresa dice cuáles van. Felipe: "me puede
// preguntar cuál está pensando traer. Yo le confirmo si sí o si no, que
// busque otras. Y listo, con eso las arma". Si las bases no piden
// experiencia, no aparece.

const pesos = (n: number | null) =>
  n === null ? "sin monto" : formatCurrency(n, "CLP");

const deDonde = (c: CandidataDeExperiencia) =>
  c.de === "mi_empresa"
    ? "Mercado Público"
    : `Evento N° ${c.evento ?? ""} de Eventia`;

function Fila({
  c,
  numero,
  reserva,
  va,
  alCambiar,
}: {
  readonly c: CandidataDeExperiencia;
  readonly numero: number;
  readonly reserva: boolean;
  /** null = ya confirmada: sin casilla. */
  readonly va: boolean | null;
  readonly alCambiar: () => void;
}) {
  return (
    <li className="flex items-start gap-2 py-2">
      {va !== null && (
        <input
          type="checkbox"
          checked={va}
          onChange={alCambiar}
          aria-label={`Va ${c.mandante ?? c.numero ?? c.clave}`}
          className="mt-1"
        />
      )}
      <div className={`min-w-0 text-sm ${va === false ? "opacity-50" : ""}`}>
        <p className="text-gray-900">
          <span className="font-semibold">{numero}.</span>{" "}
          {c.mandante ?? "Sin mandante"}
          {c.contrato ? ` · ${c.contrato}` : ""}
          {c.anio ? ` · ${c.anio}` : ""} ·{" "}
          <span className="font-semibold">{pesos(c.monto)}</span>
          {reserva && (
            <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
              Reserva
            </span>
          )}
        </p>
        <p className="text-xs text-gray-500">
          {deDonde(c)}
          {c.numero ? ` · N° ${c.numero}` : ""}
          {c.por_que ? ` · ${c.por_que}` : ""}
        </p>
      </div>
    </li>
  );
}

export default function LaExperiencia({
  oportunidadId,
  congelada = false,
}: {
  readonly oportunidadId: number;
  /** Postulada o ganada: lo postulado queda fijo (decisión 33). */
  readonly congelada?: boolean;
}) {
  const qc = useQueryClient();
  const clave = claveDeLaExperiencia(oportunidadId);
  const { data } = useQuery({
    queryKey: clave,
    queryFn: () => getExperiencia(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.trabajo?.estado === "procesando" ? 4000 : false,
  });
  const [quitadas, setQuitadas] = useState<Set<string>>(new Set());
  const guardar = (trabajo: TrabajoDeExperiencia) =>
    qc.setQueryData<EstadoDeLaExperiencia>(clave, (antes) => ({
      piden: antes?.piden ?? true,
      trabajo,
    }));

  const proponer = useMutation({
    mutationFn: (excluir: string[]) =>
      proponerExperiencia(oportunidadId, excluir),
    onSuccess: (trabajo) => {
      guardar(trabajo);
      setQuitadas(new Set());
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo pedir la experiencia.")),
  });
  const confirmar = useMutation({
    mutationFn: () => confirmarExperiencia(oportunidadId, [...quitadas]),
    onSuccess: (trabajo) => {
      guardar(trabajo);
      setQuitadas(new Set());
      toast.success("Experiencia confirmada: ya puedes armar la postulación.");
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo confirmar la experiencia.")),
  });

  if (!data?.piden) return null;
  const trabajo = data.trabajo;
  const r = trabajo?.estado === "listo" ? trabajo.resultado : null;
  const confirmada = Boolean(r?.confirmada);
  const ocupado = proponer.isPending || confirmar.isPending;
  const cambiar = (c: CandidataDeExperiencia) =>
    setQuitadas((antes) => {
      const nuevas = new Set(antes);
      if (nuevas.has(c.clave)) nuevas.delete(c.clave);
      else nuevas.add(c.clave);
      return nuevas;
    });
  const buscarOtras = () =>
    proponer.mutate([...(trabajo?.parametros?.excluir ?? []), ...quitadas]);

  return (
    <section className="rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="space-y-0.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          {confirmada ? (
            <CheckCircle2 size={15} className="text-green-600" />
          ) : (
            <Award size={15} />
          )}
          La experiencia
        </h3>
        <p className="text-xs text-gray-500">
          La IA la elige según lo que piden las bases: primero tus órdenes de
          compra de Mercado Público de «Mi empresa» y, si hace falta, tus
          eventos de Eventia que se pueden mostrar. Tú confirmas cuáles van
          antes de armar.
        </p>
      </div>

      {!trabajo && !congelada && (
        <button
          type="button"
          onClick={() => proponer.mutate([])}
          disabled={ocupado}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {proponer.isPending && <Loader2 size={14} className="animate-spin" />}
          Proponer experiencia
        </button>
      )}

      {trabajo?.estado === "procesando" && (
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 size={14} className="animate-spin" /> La IA está eligiendo tu
          experiencia según las bases… tarda un minuto.
        </p>
      )}

      {trabajo?.estado === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-red-600">
            {trabajo.error ?? "No se pudo elegir la experiencia."}
          </p>
          {!congelada && (
            <button
              type="button"
              onClick={() => proponer.mutate([])}
              disabled={ocupado}
              className="px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            >
              Volver a proponer
            </button>
          )}
        </div>
      )}

      {r && (
        <div className="space-y-3">
          {(r.pide > 0 || r.periodo || r.condiciones) && (
            <p className="text-sm text-gray-700">
              {r.pide > 0 &&
                `Piden ${r.pide} contrato${r.pide === 1 ? "" : "s"} para el puntaje máximo. `}
              {r.periodo && `Cuentan ${r.periodo}. `}
              {r.condiciones}
            </p>
          )}
          {r.elegidas.length > 0 ? (
            <ol className="divide-y divide-gray-100">
              {r.elegidas.map((c, i) => (
                <Fila
                  key={c.clave}
                  c={c}
                  numero={i + 1}
                  reserva={r.pide > 0 && i >= r.pide}
                  va={confirmada || congelada ? null : !quitadas.has(c.clave)}
                  alCambiar={() => cambiar(c)}
                />
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-600">
              No hay experiencia con respaldo para presentar.
            </p>
          )}
          {r.faltan.length > 0 && !confirmada && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-1">
              <p className="font-semibold">
                Te conviene subir la factura de estos eventos:
              </p>
              <ul className="list-disc pl-5">
                {r.faltan.map((c) => (
                  <li key={c.clave}>
                    Evento N° {c.evento} · {c.mandante ?? "sin cliente"} ·{" "}
                    {pesos(c.monto)}
                    {c.por_que ? ` · ${c.por_que}` : ""}
                  </li>
                ))}
              </ul>
              <p className="text-xs">
                Súbela en Post-venta, en los documentos del evento, y vuelve a
                proponer.
              </p>
            </div>
          )}
          {r.nota && <p className="text-xs text-gray-600">{r.nota}</p>}
          {confirmada ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-green-700">
                Confirmada: con esto se arma la postulación.
              </p>
              {!congelada && (
                <button
                  type="button"
                  onClick={() => proponer.mutate([])}
                  disabled={ocupado}
                  className="px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                >
                  Cambiar
                </button>
              )}
            </div>
          ) : (
            !congelada && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => confirmar.mutate()}
                  disabled={ocupado}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {confirmar.isPending && (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  {quitadas.size > 0
                    ? `Confirmar sin las ${quitadas.size} que sacaste`
                    : "Confirmar"}
                </button>
                <button
                  type="button"
                  onClick={buscarOtras}
                  disabled={ocupado || quitadas.size === 0}
                  title={
                    quitadas.size === 0
                      ? "Desmarca las que no quieres y te busco otras"
                      : undefined
                  }
                  className="px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                >
                  Buscar otras
                </button>
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}
