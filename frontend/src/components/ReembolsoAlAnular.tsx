import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import NumberInput from "./inputs/NumberInput";
import { getPaymentsByQuotationId } from "../services/payments.service";
import { getRefundsByQuotation } from "../services/refunds.service";
import { disponibleParaReembolsar } from "../utils/reembolsoAlAnular";

/**
 * ¿SE REEMBOLSAN LOS ABONOS? (20-10-2026). Va dentro de la ventana del
 * motivo cuando se ANULA un evento (Post-Venta y tablero). Felipe:
 * "los reembolsos se ven caso a caso (…) el sistema debería preguntar si
 * se reembolsarán los ingresos y si se coloca sí, generar el reembolso".
 *
 * Sin abonos no pregunta nada. Con abonos hay que responder antes de
 * anular: «No» anula como siempre; «Sí» propone todo lo abonado sin
 * reembolsar y deja bajarlo, y al anular nace un reembolso PENDIENTE
 * (Post-Venta → Pagos → Reembolsos). El motor vuelve a revisar el tope.
 */
export interface DecisionDeReembolso {
  /** Ya se puede anular: no hay abonos o ya respondieron, con monto válido. */
  readonly listo: boolean;
  /** Cuánto se devuelve; sin monto, no se reembolsa. */
  readonly monto?: number;
}

const pesos = (n: number) => "$" + n.toLocaleString("es-CL");

export default function ReembolsoAlAnular({
  quotationId,
  disponibleInicial,
  onCambio,
}: {
  readonly quotationId: string;
  /** Lo que la pantalla ya sabe (Post-Venta: pagado menos devuelto). La caja
   *  sale al instante y el motor lo confirma en segundo plano (Felipe,
   *  20-10-2026: "se demoró un poco en aparecer la caja ámbar"). */
  readonly disponibleInicial?: number;
  /** Debe ser estable (un setState): se llama cada vez que cambia la respuesta. */
  readonly onCambio: (decision: DecisionDeReembolso) => void;
}) {
  const {
    data: disponible = 0,
    isLoading,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["reembolsoAlAnular", quotationId],
    queryFn: async () => {
      const [{ data: cuotas }, reembolsos] = await Promise.all([
        getPaymentsByQuotationId(quotationId),
        getRefundsByQuotation(quotationId),
      ]);
      return disponibleParaReembolsar(
        cuotas as Parameters<typeof disponibleParaReembolsar>[0],
        reembolsos,
      );
    },
    staleTime: 0,
    // Con lo que ya se sabe, sin espera; vencido de entrada para que el
    // motor lo confirme igual (y descuente los reembolsos pendientes).
    initialData: disponibleInicial,
    initialDataUpdatedAt: 0,
  });
  const [respuesta, setRespuesta] = useState<"si" | "no" | null>(null);
  const [monto, setMonto] = useState<number | undefined>(undefined);
  const aDevolver = monto ?? disponible;

  useEffect(() => {
    // Mientras el motor confirma, se ve la caja pero no se puede anular.
    if (isLoading || isFetching) onCambio({ listo: false });
    else if (isError || disponible <= 0 || respuesta === "no")
      onCambio({ listo: true });
    else if (respuesta === "si")
      onCambio({
        listo: aDevolver >= 1 && aDevolver <= disponible,
        monto: aDevolver,
      });
    else onCambio({ listo: false });
  }, [
    isLoading,
    isFetching,
    isError,
    disponible,
    respuesta,
    aDevolver,
    onCambio,
  ]);

  if (isLoading)
    return <p className="text-xs text-gray-500">Revisando los abonos…</p>;
  if (isError)
    return (
      <p className="text-xs text-amber-700">
        No pude revisar los abonos de este evento. Si hay que devolver plata,
        anula y avísale a quien lleva Post-Venta.
      </p>
    );
  if (disponible <= 0) return null;

  const opcion = (valor: "si" | "no", texto: string) => (
    <button
      type="button"
      onClick={() => setRespuesta(valor)}
      aria-pressed={respuesta === valor}
      className={`px-3 py-1.5 text-sm font-semibold rounded-lg border ${
        respuesta === valor
          ? "border-blue-500 bg-blue-50 text-blue-900"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {texto}
    </button>
  );

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
      <p className="text-sm font-semibold text-amber-900">
        Este evento tiene {pesos(disponible)} abonados. ¿Se reembolsan?
      </p>
      <div className="flex gap-2">
        {opcion("si", "Sí, reembolsar")}
        {opcion("no", "No")}
      </div>
      {/* AL ANULAR, LO PAGADO ES EL 100% (Felipe, 22-10-2026; doc 14). */}
      <p className="text-[11px] text-amber-800">
        Al anular, lo pagado queda como el total: las cuotas por cobrar se
        cierran y no se le cobra nada más.
      </p>
      {respuesta === "si" && (
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-xs text-gray-700">
            Monto a devolver
            <NumberInput
              value={aDevolver}
              onChange={(v) => setMonto(v ?? 0)}
              min={1}
              max={disponible}
              formatThousands
              currency
              className="w-36 text-right"
            />
          </label>
          <p className="text-[11px] text-amber-800">
            Queda como reembolso pendiente en Post-Venta → Pagos → Reembolsos,
            para registrarlo cuando se pague.
          </p>
        </div>
      )}
    </div>
  );
}
