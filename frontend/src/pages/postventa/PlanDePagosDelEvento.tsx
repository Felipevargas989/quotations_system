import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import PaymentPlanEditor from "../../components/PaymentPlanEditor";
import { toast } from "../../components/toast/Toast";
import { editarPlanDePagos } from "../../services/payments.service";
import { humanizeApiError } from "../../utils/apiErrors";
import type { EventRow } from "./filasDePostVenta";

/**
 * «EDITAR PLAN DE PAGOS» EN LA PESTAÑA PAGOS (Felipe, 28-10-2026; doc 14
 * §Editar el plan). Caso 703: el plan nació con una cuota del 100% y acá
 * solo se movía la fecha y la nota de cada cuota, así que para repartirlo
 * se anuló y se volvió a aceptar. Felipe: "ella quería editar las cuotas".
 *
 * Con plan: «Editar plan de pagos» (montos, fechas y cantidad de cuotas; las
 * cuotas con pagos no se mueven). Sin cuotas (aceptada o realizada que quedó
 * sin plan): el aviso ámbar y «Armar plan de pagos». Un anulado no se edita:
 * su plan quedó cerrado en lo pagado. Es la cabecera del «Calendario de
 * pagos»; vive aparte por el techo de tamaño de PostVentaPage.
 */
export default function CabeceraDelPlan({
  event,
  onGuardado,
}: {
  readonly event: EventRow;
  readonly onGuardado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const queryClient = useQueryClient();
  const sinPlan = event.cuotas === 0;
  // Una cortesía de $0 sin cuotas no tiene nada que cobrar ni que editar.
  const nadaQueCobrar = sinPlan && event.total <= 0;

  const guardar = async (
    cuotas: { payment_type: string; amount: number; due_date: string }[],
  ) => {
    setGuardando(true);
    try {
      await editarPlanDePagos(event.quotationId, cuotas);
      toast.success(
        sinPlan ? "Plan de pagos armado." : "Plan de pagos actualizado.",
      );
      setAbierto(false);
      // El freno del guardado de Servicios lee si hay plan vivo.
      void queryClient.invalidateQueries({ queryKey: ["payments"] });
      onGuardado();
    } catch (error) {
      toast.error(
        `No se pudo guardar el plan: ${humanizeApiError(error, "intenta de nuevo.")}`,
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-bold text-gray-800">Calendario de pagos</h4>
        {!event.cancelled && !sinPlan && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            <Pencil size={13} /> Editar plan de pagos
          </button>
        )}
      </div>
      {!event.cancelled && sinPlan && !nadaQueCobrar && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">
            Este evento no tiene plan de pagos: sin cuotas no hay cobranza ni
            avisos al cliente.
          </p>
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Armar plan de pagos
          </button>
        </div>
      )}
      {abierto && (
        <PaymentPlanEditor
          modo="editar"
          guardando={guardando}
          quotation={{
            id: event.quotationId,
            quotation_number: event.quotationNumber,
            client_name: event.clientName,
            total_amount: event.total,
            event_date: event.eventDate,
          }}
          onSave={guardar}
          onCancel={() => setAbierto(false)}
        />
      )}
    </>
  );
}
