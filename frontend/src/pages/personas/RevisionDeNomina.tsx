import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Modal from "../../components/Modal";
import Tooltip from "../../components/Tooltip";
import { previaPreliminar } from "../../services/people.service";
import { eventosQueryOptions } from "./FichasTab";
import type { LineaDeNomina, PreviaNomina } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { nombreBanco, etiquetaTipoCuenta } from "../../utils/bancos";
import { formatearRut } from "../../utils/rut";

/**
 * EL CUERPO DE LA REVISIÓN — compartido (18-08).
 *
 * La misma tabla en dos momentos: en Nómina, "Revisa antes de subir al
 * banco" (lo liquidado, por pagar); y en la ficha de un evento, al
 * pinchar "Liquidar este evento…", como instancia de aprobación con lo
 * que QUEDARÍA por pagar (Felipe, 18-08: "podría traerme
 * preliminarmente el mismo modal que me mostrará después en nómina").
 * Un solo cuerpo para que las dos digan exactamente lo mismo.
 */

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");

export default function CuerpoDeRevision({
  previa,
  isLoading,
  error,
}: {
  readonly previa: PreviaNomina | undefined;
  readonly isLoading: boolean;
  readonly error: unknown;
}) {
  const { data: eventos = [] } = useQuery(eventosQueryOptions);
  const nombreOrigen = useMemo(() => {
    const m = new Map(eventos.map((q) => [q.id, q.cliente]));
    return (qid: string | null) =>
      qid === null ? "Restaurante" : (m.get(qid) ?? "Evento");
  }, [eventos]);

  /** El desglose de una cifra: de dónde sale y cuántos días. */
  const desglose = (
    linea: LineaDeNomina,
    cual: "jornadas" | "propinas" | "total",
  ) => {
    const partes = linea.detalle
      .map((d) => ({
        nombre: nombreOrigen(d.quotation_id),
        dias: d.dias,
        monto:
          cual === "total" ? d.jornadas + d.propinas : (d[cual] ?? 0),
      }))
      .filter((d) => d.monto > 0);
    return {
      lista: partes,
      texto: partes
        .map(
          (d) =>
            `${d.nombre}: ${d.dias} ${d.dias === 1 ? "día" : "días"} · ${clp(d.monto)}`,
        )
        .join(" — "),
    };
  };

  /** La cifra con su explicación al pasar el mouse. */
  const cifra = (
    linea: LineaDeNomina,
    cual: "jornadas" | "propinas" | "total",
    monto: number,
    clase: string,
  ) => {
    if (!monto) return <span className="text-gray-400">—</span>;
    const d = desglose(linea, cual);
    return (
      <Tooltip
        // Las columnas de la derecha abren hacia la izquierda: si no, el
        // detalle se sale del modal y se corta (Felipe, 17-08).
        lado="izquierda"
        titulo={d.texto}
        contenido={
          <span className="block space-y-0.5">
            {d.lista.map((x) => (
              <span key={x.nombre} className="flex justify-between gap-3">
                <span>
                  {x.nombre}
                  <span className="text-gray-400">
                    {" "}
                    · {x.dias} {x.dias === 1 ? "día" : "días"}
                  </span>
                </span>
                <span className="tabular-nums">{clp(x.monto)}</span>
              </span>
            ))}
          </span>
        }
      >
        <span className={clase}>{clp(monto)}</span>
      </Tooltip>
    );
  };

  const dato = (v: string | null | undefined) =>
    v && v.trim() ? v : <span className="text-red-600">falta</span>;

  return (
    <>
      {isLoading ? (
        <p className="text-sm text-gray-500 py-6 text-center">Calculando…</p>
      ) : error || !previa ? (
        <p className="text-sm text-red-700 py-6 text-center">
          {humanizeApiError(error)}
        </p>
      ) : (
        <div className="space-y-3">
          {previa.fichas_repetidas.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {previa.fichas_repetidas.join(", ")}{" "}
              {previa.fichas_repetidas.length === 1
                ? "aparece"
                : "aparecen"}{" "}
              con más de una ficha y el mismo RUT. Se paga una sola vez —
              conviene unificar esas fichas en Personal.
            </p>
          )}
          {previa.sin_cuenta.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Sin cuenta bancaria: {previa.sin_cuenta.join(", ")}. La nómina
              se genera igual; ese pago tendrás que resolverlo aparte.
            </p>
          )}

          {/* Sin overflow-x-auto: ese contenedor recorta también hacia
              ARRIBA, y el detalle al pasar el mouse por una cifra de la
              primera fila quedaba cortado (Felipe, 17-08). El modal ya es
              ancho para las siete columnas; si un día no cupiera, el
              propio modal desplaza. */}
          <div className="overflow-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3 font-semibold">Persona</th>
                  <th className="py-2 pr-3 font-semibold">RUT</th>
                  <th className="py-2 pr-3 font-semibold">Banco</th>
                  <th className="py-2 pr-3 font-semibold">Cuenta</th>
                  <th className="py-2 pr-3 font-semibold">Tipo</th>
                  <th className="py-2 pr-3 font-semibold text-right">
                    Jornadas
                  </th>
                  <th className="py-2 pr-3 font-semibold text-right">
                    Propinas
                  </th>
                  <th className="py-2 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {previa.personas.map((p) => (
                  <tr key={p.person_ids.join("-")}>
                    <td className="py-2 pr-3 font-medium text-gray-900 whitespace-nowrap">
                      {p.nombre}
                      {p.person_ids.length > 1 && (
                        <span className="ml-1.5 text-xs text-amber-700">
                          ({p.person_ids.length} fichas)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                      {p.rut ? formatearRut(p.rut) : dato(null)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {p.bank_code ? nombreBanco(p.bank_code) : dato(null)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                      {p.account_number ? p.account_number : dato(null)}
                    </td>
                    {/* El tipo en su columna: pegado al número, cada
                        largo de cuenta lo corría (Felipe, 18-08). */}
                    <td className="py-2 pr-3 text-xs text-gray-400 whitespace-nowrap">
                      {p.account_type
                        ? etiquetaTipoCuenta(p.account_type as never)
                        : ""}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-600">
                      {cifra(p, "jornadas", p.jornadas, "cursor-help")}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-600">
                      {cifra(p, "propinas", p.propinas, "cursor-help")}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-900">
                      {cifra(
                        p,
                        "total",
                        p.total,
                        "cursor-help font-semibold underline decoration-dotted decoration-gray-300 underline-offset-4",
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {/* LOS TRES TOTALES AL PIE (Felipe, 18-08): jornadas,
                    propinas y el total — cada uno bajo su columna. Se
                    suman de lo que se ve, así cuadran con la lista. */}
                <tr className="border-t-2 border-gray-300">
                  <td colSpan={5} className="py-2 text-right font-medium">
                    Total a subir
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums font-semibold text-gray-700">
                    {clp(previa.personas.reduce((t, p) => t + p.jornadas, 0))}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums font-semibold text-gray-700">
                    {clp(previa.personas.reduce((t, p) => t + p.propinas, 0))}
                  </td>
                  <td className="py-2 text-right tabular-nums font-bold text-gray-900">
                    {clp(previa.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * LA REVISIÓN ANTES DE LIQUIDAR (Felipe, 18-08): al pinchar "Liquidar
 * este evento…" se abre esto como instancia de aprobación — la misma
 * tabla que Nómina, con lo que QUEDARÍA por pagar de este evento. Si
 * aprueba, pasa a la evaluación de la gente y al cierre; si no, "Volver"
 * lo deja en la ficha para seguir ajustando, sin reabrir nada.
 */
export function RevisionAntesDeLiquidar({
  quotationId,
  nombreEvento,
  onAprobar,
  onVolver,
}: {
  readonly quotationId: string;
  readonly nombreEvento: string;
  readonly onAprobar: () => void;
  readonly onVolver: () => void;
}) {
  const {
    data: previa,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["people", "previa-preliminar", quotationId],
    queryFn: () => previaPreliminar(quotationId),
    staleTime: 0,
    refetchOnMount: "always",
  });
  return (
    <Modal
      titulo="Revisa antes de liquidar"
      subtitulo={
        previa
          ? `${nombreEvento} · ${previa.personas.length} ${
              previa.personas.length === 1 ? "persona" : "personas"
            } · ${clp(previa.total)} — así quedaría por pagar`
          : nombreEvento
      }
      ancho="max-w-5xl"
      onCerrar={onVolver}
      pie={
        <>
          <button
            type="button"
            onClick={onVolver}
            className="mr-auto px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Volver a la ficha
          </button>
          <button
            type="button"
            onClick={onAprobar}
            disabled={isLoading || !previa}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-black disabled:opacity-40 whitespace-nowrap"
          >
            Aprobar y evaluar al equipo →
          </button>
        </>
      }
    >
      <CuerpoDeRevision previa={previa} isLoading={isLoading} error={error} />
    </Modal>
  );
}
