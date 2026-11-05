import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import NumberInput from "../../../components/inputs/NumberInput";
import { toast } from "../../../components/toast/Toast";
import { crearCobro, getPorBoletear } from "../../../services/boletas.service";
import { humanizeApiError } from "../../../utils/apiErrors";

// LO QUE EL EVENTO DEJA POR BOLETEAR (doc 19 §9.4, paso 3a). El
// administrador deja el total (el alojamiento de una delegación, por
// ejemplo) y recepción lo reparte por cabaña en la sección «Boletas». Acá se
// ve cuánto va boleteado de cada cobro del evento.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

export default function CobrosDelEvento({
  quotationId,
  esAdmin,
}: {
  readonly quotationId: string;
  readonly esAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const llave = ["boletas", "del-evento", quotationId];
  const cobros = useQuery({
    queryKey: llave,
    queryFn: () => getPorBoletear(quotationId),
  });
  const [abierto, setAbierto] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [guardando, setGuardando] = useState(false);

  const lista = cobros.data?.cobros ?? [];
  if (!esAdmin && lista.length === 0) return null;

  const guardar = async () => {
    if (!descripcion.trim() || !total) return;
    setGuardando(true);
    try {
      await crearCobro({
        quotation_id: quotationId,
        descripcion: descripcion.trim(),
        total,
      });
      setAbierto(false);
      setDescripcion("");
      setTotal(undefined);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: llave }),
        queryClient.invalidateQueries({
          queryKey: ["boletas", "por-boletear"],
        }),
      ]);
      toast.success("Quedó por boletear: recepción lo reparte en «Boletas».");
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo dejar el cobro."));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Por boletear</h3>
        {esAdmin && !abierto && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
          >
            <Plus size={13} /> Dejar para boletear
          </button>
        )}
      </div>

      {abierto && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3">
          <label className="block min-w-[14rem] flex-1">
            <span className="flex justify-between text-xs text-gray-500">
              Qué se cobra
              <span>{Array.from(descripcion).length}/55</span>
            </span>
            <input
              type="text"
              value={descripcion}
              maxLength={55}
              placeholder="Ej.: Delegación Vilcún · alojamiento 12 al 15-11"
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
            />
          </label>
          <label className="block w-40">
            <span className="text-xs text-gray-500">Total con IVA</span>
            <NumberInput
              value={total}
              min={0}
              currency
              placeholder="0"
              onChange={setTotal}
              className="px-3 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={guardando || !descripcion.trim() || !total}
            onClick={() => void guardar()}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold"
          >
            Cancelar
          </button>
        </div>
      )}

      {lista.length === 0 && !abierto ? (
        <p className="text-sm text-gray-500">
          Sin cobros por boletear. El alojamiento de una delegación, por
          ejemplo, se deja acá y recepción lo reparte por cabaña.
        </p>
      ) : (
        lista.map((c) => (
          <div
            key={c.id}
            className="flex items-start justify-between gap-3 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0 text-sm"
          >
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 break-words">
                {c.descripcion}
              </p>
              <p className="text-xs text-gray-500">
                {c.lineas.length} {c.lineas.length === 1 ? "cabaña" : "cabañas"}{" "}
                · boleteado {clp(c.boleteado)} de {clp(c.total)}
              </p>
            </div>
            <Link
              to="/boletas"
              className="shrink-0 text-xs font-semibold text-blue-600 hover:underline"
            >
              {c.boleteado >= c.total ? "Ver en Boletas" : "Ir a Boletas"}
            </Link>
          </div>
        ))
      )}
    </div>
  );
}
