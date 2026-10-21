import { useState } from "react";
import NumberInput from "../../components/inputs/NumberInput";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { MEDIOS_DE_PAGO } from "../../constants/mediosDePago";
import { registrarReembolso } from "../../services/refunds.service";
import { uploadRefundReceipt } from "../../services/storage.service";
import { hoyEnChile } from "../../utils/dates";
import { pesos } from "../../utils/reembolsosDelEvento";

/**
 * «+ REGISTRAR REEMBOLSO» (20-10-2026). Felipe: "un botón que diga registrar
 * reembolso (…) bajo la misma lógica que está el calendario de pagos". Va
 * contra lo que falta por devolver: propone todo y no deja pasarse. Cada
 * registro nace pagado y la barra roja se vacía en ese monto.
 */
export default function RegistrarReembolsoPanel({
  quotationId,
  pendiente,
  onChanged,
}: {
  readonly quotationId: string;
  /** Lo que falta por devolver. */
  readonly pendiente: number;
  readonly onChanged: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState<number | undefined>(undefined);
  const [fecha, setFecha] = useState(hoyEnChile());
  const [medio, setMedio] = useState(MEDIOS_DE_PAGO[0]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pendiente <= 0) return null;
  const aDevolver = monto ?? pendiente;
  const valido = aDevolver >= 1 && aDevolver <= pendiente && !!fecha;

  const cerrar = () => {
    setAbierto(false);
    setMonto(undefined);
    setFecha(hoyEnChile());
    setMedio(MEDIOS_DE_PAGO[0]);
    setArchivo(null);
    setError(null);
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      let receipt_url: string | null = null;
      if (archivo) {
        const subido = await uploadRefundReceipt(archivo, quotationId, "nuevo");
        if (!subido.success)
          throw new Error(subido.error || "No se pudo subir el comprobante");
        receipt_url = subido.url || null;
      }
      const { error: falla } = await registrarReembolso({
        quotation_id: quotationId,
        amount: Math.round(aDevolver),
        refund_date: fecha,
        payment_method: medio,
        receipt_url,
      });
      if (falla) throw falla;
      cerrar();
      onChanged();
    } catch (e) {
      const delMotor = (e as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setError(
        delMotor ||
          (e instanceof Error
            ? e.message
            : "No se pudo registrar el reembolso"),
      );
    } finally {
      setGuardando(false);
    }
  };

  if (!abierto)
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700"
      >
        + Registrar reembolso
      </button>
    );

  return (
    <div className="border border-red-200 bg-red-50/40 rounded-xl p-4 space-y-3 max-w-2xl">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-bold text-gray-800">Registrar reembolso</h4>
        <span className="text-xs font-semibold text-red-700">
          Falta por reembolsar {pesos(pendiente)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-600">Monto</label>
          <NumberInput
            value={aDevolver}
            onChange={(v) => setMonto(v ?? 0)}
            min={1}
            max={pendiente}
            formatThousands
            currency
            className="text-right"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 items-end">
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
          onClick={cerrar}
          className="px-3 py-1.5 text-sm text-gray-600"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={!valido || guardando}
          className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar reembolso"}
        </button>
      </div>
    </div>
  );
}
