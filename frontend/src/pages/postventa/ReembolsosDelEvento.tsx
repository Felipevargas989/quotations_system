import { useState } from "react";
import { Pencil, Trash2, Undo2 } from "lucide-react";
import ConfirmInline from "../../components/ConfirmInline";
import NumberInput from "../../components/inputs/NumberInput";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { MEDIOS_DE_PAGO } from "../../constants/mediosDePago";
import { useReembolsosDelEvento } from "../../hooks/useReembolsosDelEvento";
import {
  eliminarReembolso,
  registerRefund,
} from "../../services/refunds.service";
import { uploadRefundReceipt } from "../../services/storage.service";
import type { Refund } from "../../types/refunds.types";
import { formatFechaEvento } from "../../utils/dates";
import { pesos } from "../../utils/reembolsosDelEvento";
import RegistrarReembolsoPanel from "./RegistrarReembolsoPanel";

/**
 * LOS REEMBOLSOS DE LA FICHA, COMO EL CALENDARIO DE PAGOS (20-10-2026).
 * Felipe: "una vez que registro el reembolso, me genera abajo como la cuota
 * del reembolso con el mismo ver, con el botón de editar para poder editar
 * la fecha y eliminar para poder eliminar".
 *
 * Cada fila es un reembolso REGISTRADO (pagado). Lo que falta por devolver
 * no es una fila: en un evento anulado es la barra roja de arriba; en uno
 * vigente (reembolso por baja del total) se dice aquí con su botón.
 * Eliminar devuelve el monto a lo que falta; editar mueve la diferencia.
 */
export default function ReembolsosDelEvento({
  quotationId,
  conBoton,
  onChanged,
  onVer,
}: {
  readonly quotationId: string;
  /** El botón va aquí cuando arriba manda «Registrar pago» (evento vigente). */
  readonly conBoton: boolean;
  readonly onChanged: () => void;
  /** «Ver»: el comprobante va al visor de la derecha, como los abonos. */
  readonly onVer: (doc: { file_url: string; file_name: string }) => void;
}) {
  const { registrados, pendiente, total, cargando } =
    useReembolsosDelEvento(quotationId);

  return (
    <div className="space-y-3 border-t border-gray-200 pt-5">
      <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
        <Undo2 size={15} className="text-red-500" /> Reembolsos
      </h4>
      {cargando ? (
        <div className="py-4 flex justify-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500" />
        </div>
      ) : total === 0 ? (
        <p className="text-sm text-gray-500">
          Sin reembolsos. Nacen al anular un evento con abonos, si respondes
          «Sí, reembolsar», o cuando el total baja de lo ya pagado.
        </p>
      ) : (
        <>
          {conBoton && pendiente > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm font-semibold text-red-700">
                Por reembolsar {pesos(pendiente)}
              </span>
              <RegistrarReembolsoPanel
                quotationId={quotationId}
                pendiente={pendiente}
                onChanged={onChanged}
              />
            </div>
          )}
          {registrados.length === 0 ? (
            <p className="text-sm text-gray-500">
              Todavía no hay reembolsos registrados.
            </p>
          ) : (
            registrados.map((r) => (
              <FilaDeReembolso
                key={r.id}
                reembolso={r}
                quotationId={quotationId}
                pendiente={pendiente}
                onChanged={onChanged}
                onVer={onVer}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}

function FilaDeReembolso({
  reembolso,
  quotationId,
  pendiente,
  onChanged,
  onVer,
}: {
  readonly reembolso: Refund;
  readonly quotationId: string;
  readonly pendiente: number;
  readonly onChanged: () => void;
  readonly onVer: (doc: { file_url: string; file_name: string }) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monto, setMonto] = useState<number>(Number(reembolso.amount) || 0);
  const [fecha, setFecha] = useState(reembolso.refund_date || "");
  const [medio, setMedio] = useState(
    reembolso.payment_method || MEDIOS_DE_PAGO[0],
  );
  const [archivo, setArchivo] = useState<File | null>(null);
  // Hasta dónde puede subir: lo suyo más lo que falta por devolver.
  const tope = (Number(reembolso.amount) || 0) + pendiente;
  const fechaVista = reembolso.refund_date
    ? formatFechaEvento(reembolso.refund_date)
    : "";

  const delMotor = (e: unknown, porDefecto: string) =>
    (e as { response?: { data?: { message?: string } } })?.response?.data
      ?.message || (e instanceof Error ? e.message : porDefecto);

  const guardar = async () => {
    setOcupado(true);
    setError(null);
    try {
      let receipt_url = reembolso.receipt_url || null;
      if (archivo) {
        const subido = await uploadRefundReceipt(
          archivo,
          quotationId,
          reembolso.id,
        );
        if (!subido.success)
          throw new Error(subido.error || "No se pudo subir el comprobante");
        receipt_url = subido.url || null;
      }
      const { error: falla } = await registerRefund(reembolso.id, {
        amount: Math.round(monto),
        refund_date: fecha,
        payment_method: medio,
        receipt_url,
      });
      if (falla) throw falla;
      setEditando(false);
      onChanged();
    } catch (e) {
      setError(delMotor(e, "No se pudo guardar el reembolso"));
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = async () => {
    setOcupado(true);
    setError(null);
    const { error: falla } = await eliminarReembolso(reembolso.id);
    setOcupado(false);
    setConfirmando(false);
    if (falla) {
      setError(delMotor(falla, "No se pudo eliminar el reembolso"));
      return;
    }
    onChanged();
  };

  return (
    <div className="border border-red-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 p-3 bg-red-50">
        <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700">
          Reembolso
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-900">
            {pesos(Number(reembolso.amount) || 0)}
            {fechaVista ? ` · ${fechaVista}` : ""}
          </div>
          <div className="text-xs text-gray-500">
            {reembolso.payment_method || "—"}
          </div>
        </div>
        {confirmando ? (
          <ConfirmInline
            question="¿Eliminar este reembolso? Su monto vuelve a lo que falta por devolver."
            onYes={() => void eliminar()}
            onNo={() => setConfirmando(false)}
            busy={ocupado}
          />
        ) : (
          <span className="flex items-center gap-3 shrink-0">
            {reembolso.receipt_url && (
              <button
                type="button"
                onClick={() =>
                  onVer({
                    file_url: reembolso.receipt_url!,
                    file_name: `Comprobante de reembolso · ${pesos(Number(reembolso.amount) || 0)}${fechaVista ? ` · ${fechaVista}` : ""}`,
                  })
                }
                className="text-sm font-semibold text-blue-600 hover:underline"
              >
                Ver
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditando((v) => !v)}
              className="text-gray-400 hover:text-red-600"
              title="Editar el reembolso (fecha, medio, monto o comprobante)"
              aria-label="Editar reembolso"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="text-gray-400 hover:text-red-600"
              title="Eliminar el reembolso (su monto vuelve a lo que falta por devolver)"
              aria-label="Eliminar reembolso"
            >
              <Trash2 size={14} />
            </button>
          </span>
        )}
      </div>
      {error && !editando && (
        <p className="px-3 py-2 text-xs text-red-600 bg-white">{error}</p>
      )}
      {editando && (
        <div className="p-3 border-t border-red-200 bg-white space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600">
                Fecha
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">
                Medio de pago
              </label>
              <SelectWithSearch
                options={MEDIOS_DE_PAGO.map((m) => ({ value: m, label: m }))}
                value={medio}
                onChange={setMedio}
                placeholder="Medio de pago"
                searchPlaceholder="Buscar medio…"
                noResultsText="Sin resultados"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="text-xs font-semibold text-gray-600">
                Monto
              </label>
              <NumberInput
                value={monto || undefined}
                onChange={(v) => setMonto(v || 0)}
                min={1}
                max={tope}
                formatThousands
                currency
                className="text-right"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">
                Comprobante{" "}
                <span className="font-normal text-gray-400">
                  (imagen o PDF · máx. 5 MB)
                </span>
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                className="block w-full text-xs text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:text-xs file:font-semibold hover:file:bg-gray-200"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="px-3 py-1.5 text-sm text-gray-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={ocupado || !(monto >= 1 && monto <= tope) || !fecha}
              className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              {ocupado ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
