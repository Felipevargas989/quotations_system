import { useMutation } from "@tanstack/react-query";
import { CalendarCheck, Loader2 } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import { traerRespaldosDeEventia } from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { resumenDeTraer } from "./respaldos";

// «TRAER DE EVENTIA» (decisión 45 del doc 17, 19-10). Felipe: "podemos
// buscar en el mismo Eventia y ahí tenemos las facturas y quién fue... la
// factura de CCU o la orden de compra". Las facturas y órdenes de compra
// que se subieron a cada evento ya hecho pasan a esta carpeta como
// respaldos de experiencia, una por evento, leídas con IA y sin repetir lo
// que ya está. «Armar postulación» hace lo mismo sola, antes de los anexos.

export default function TraerDeEventia({
  alTraer,
}: {
  /** Cuando trajo alguno: recargar la carpeta. */
  readonly alTraer: () => void;
}) {
  const traer = useMutation({
    mutationFn: traerRespaldosDeEventia,
    onSuccess: (r) => {
      if (r.traidos > 0) alTraer();
      toast.success(resumenDeTraer(r));
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo traer de Eventia.")),
  });
  const sinTraer = traer.data?.sin_traer ?? [];

  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-xs text-gray-600">
          ¿Las facturas u órdenes de compra ya están en tus eventos de Eventia?
          Tráelas como respaldos: una por evento ya hecho, leída con IA, sin
          repetir las que ya están aquí.
        </p>
        <button
          type="button"
          onClick={() => traer.mutate()}
          disabled={traer.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-xs font-semibold text-gray-800 hover:bg-gray-100 disabled:opacity-50"
        >
          {traer.isPending ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <CalendarCheck size={13} aria-hidden="true" />
          )}
          {traer.isPending ? "Leyendo tus eventos…" : "Traer de Eventia"}
        </button>
      </div>
      {traer.isPending && (
        <p className="text-xs text-gray-500">
          Puede tardar un minuto: la IA lee cada factura y orden de compra.
        </p>
      )}
      {sinTraer.length > 0 && (
        <ul className="space-y-0.5 text-xs text-amber-800">
          {sinTraer.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
