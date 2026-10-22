import { anchoPorReembolsar, pesos } from "../../utils/reembolsosDelEvento";

/**
 * LA BARRA DE LA PESTAÑA PAGOS (20-10-2026). Felipe: "la misma barra que hoy
 * día es verde, que se va rellenando cuando ingreso pagos, se transforma en
 * una barra roja que se va vaciando".
 *
 * Evento vigente: verde, se llena con los pagos (como siempre). Evento
 * anulado con reembolso: la MISMA barra se vuelve roja, parte llena con lo
 * que hay que devolver y se vacía con cada reembolso registrado.
 */
export default function BarraDelEvento({
  pct,
  cuotas,
  reembolso,
}: {
  /** Porcentaje pagado (neto de reembolsos ya devueltos). */
  readonly pct: number;
  readonly cuotas: number;
  /** Solo en un evento anulado con reembolso: la barra pasa a roja. */
  readonly reembolso?: {
    readonly pendiente: number;
    readonly total: number;
    readonly registrados: readonly unknown[];
  } | null;
}) {
  if (reembolso) {
    const n = reembolso.registrados.length;
    const completo = reembolso.pendiente <= 0;
    return (
      <div className="pt-1">
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-red-400 to-red-600"
            style={{
              width: `${anchoPorReembolsar(reembolso.pendiente, reembolso.total)}%`,
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1.5">
          <span
            className={`font-semibold ${completo ? "text-green-700" : "text-red-700"}`}
          >
            {completo
              ? `Reembolsado completo · ${pesos(reembolso.total)}`
              : `Por reembolsar ${pesos(reembolso.pendiente)} de ${pesos(reembolso.total)}`}
          </span>
          <span>
            {n} reembolso{n === 1 ? "" : "s"} registrado{n === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="pt-1">
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className="h-3 rounded-full bg-gradient-to-r from-green-400 to-green-600"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1.5">
        <span>{pct}% pagado</span>
        <span>
          {cuotas} cuota{cuotas === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
