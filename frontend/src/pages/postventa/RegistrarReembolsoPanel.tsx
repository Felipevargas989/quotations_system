import { useState } from "react";
import { MEDIOS_DE_PAGO } from "../../constants/mediosDePago";
import { registrarReembolso } from "../../services/refunds.service";
import { uploadRefundReceipt } from "../../services/storage.service";
import { hoyEnChile } from "../../utils/dates";
import { pesos } from "../../utils/reembolsosDelEvento";
import FormularioDeRegistro, {
  type CamposDelRegistro,
} from "./FormularioDeRegistro";

/**
 * «+ REGISTRAR REEMBOLSO» (20-10-2026). Felipe: "un botón que diga registrar
 * reembolso (…) bajo la misma lógica que está el calendario de pagos". Usa
 * el MISMO formulario que «Registrar pago» (FormularioDeRegistro), en rojo:
 * monto, fecha, medio, comprobante con arrastrar y soltar, y notas. Va
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
  const vacio = (): CamposDelRegistro => ({
    monto: pendiente,
    fecha: hoyEnChile(),
    medio: MEDIOS_DE_PAGO[0],
    notas: "",
    archivo: null,
  });
  const [abierto, setAbierto] = useState(false);
  const [campos, setCampos] = useState<CamposDelRegistro>(vacio);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pendiente <= 0) return null;
  const valido =
    campos.monto >= 1 && campos.monto <= pendiente && !!campos.fecha;

  const abrir = () => {
    setCampos(vacio());
    setError(null);
    setAbierto(true);
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      let receipt_url: string | null = null;
      if (campos.archivo) {
        const subido = await uploadRefundReceipt(
          campos.archivo,
          quotationId,
          "nuevo",
        );
        if (!subido.success)
          throw new Error(subido.error || "No se pudo subir el comprobante");
        receipt_url = subido.url || null;
      }
      const { error: falla } = await registrarReembolso({
        quotation_id: quotationId,
        amount: Math.round(campos.monto),
        refund_date: campos.fecha,
        payment_method: campos.medio,
        receipt_url,
        notes: campos.notas.trim() || null,
      });
      if (falla) throw falla;
      setAbierto(false);
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
        onClick={abrir}
        className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700"
      >
        + Registrar reembolso
      </button>
    );

  return (
    <FormularioDeRegistro
      tono="reembolso"
      titulo="Registrar reembolso"
      campos={campos}
      onCampos={setCampos}
      maximo={pendiente}
      ayudaMonto={`Falta por reembolsar: ${pesos(pendiente)}`}
      textoBoton={
        valido ? `Reembolsar ${pesos(campos.monto)}` : "Registrar reembolso"
      }
      valido={valido}
      guardando={guardando}
      error={error}
      onGuardar={() => void guardar()}
      onCerrar={() => setAbierto(false)}
    />
  );
}
