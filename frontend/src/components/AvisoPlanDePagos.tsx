import { useQuery } from "@tanstack/react-query";
import { getPaymentsByQuotationId } from "../services/payments.service";
import { QuotationStatus } from "../types/quotations.types";

/**
 * EL AVISO ÁMBAR DEL PLAN DE PAGOS (caso 501, 06-09 — pedido de
 * Felipe: "un aviso ámbar como el de evento provisionado"). Al editar
 * una cotización ACEPTADA que ya tiene cuotas, anuncia lo que la
 * cascada del motor hará al guardar si cambia el total: descuenta de
 * las cuotas pendientes desde la última, genera reembolso si lo
 * pagado supera el total nuevo, o agranda la última cuota si sube.
 * La cascada existe desde siempre — esto solo la ANUNCIA antes del
 * guardar, para que nadie se sorprenda.
 */
export default function AvisoPlanDePagos({
  quotationId,
  estado,
  conGuardadoManual = false,
}: {
  readonly quotationId?: string;
  readonly estado?: QuotationStatus | string;
  /** Pestaña Servicios (Felipe, 06-09): con plan vivo el guardado
   *  automático se apaga y el aviso lo dice — nada se confirma sin
   *  apretar el botón Guardar. */
  readonly conGuardadoManual?: boolean;
}) {
  const aceptada = estado === QuotationStatus.ACEPTADA;
  const { data } = useQuery({
    queryKey: ["payments", quotationId],
    queryFn: () => getPaymentsByQuotationId(quotationId as string),
    enabled: Boolean(quotationId) && aceptada,
    staleTime: 30_000,
  });
  const cuotas = (data as { data?: unknown[] } | undefined)?.data ?? [];
  if (!quotationId || !aceptada || cuotas.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
      <p className="text-xs font-semibold text-amber-800">
        ⚠ Este evento ya tiene plan de pagos
      </p>
      <p className="text-xs text-amber-700 mt-0.5">
        {conGuardadoManual
          ? "El guardado automático está apagado en esta pestaña: nada cambia hasta que aprietes «Guardar cambios». "
          : ""}
        Si cambias el total y aprietas Guardar, el plan se ajusta solo: la
        diferencia se descuenta de las cuotas pendientes (desde la última), y
        si lo abonado supera el total nuevo se genera un reembolso; si el
        total sube, se agranda la última cuota.
      </p>
    </div>
  );
}
