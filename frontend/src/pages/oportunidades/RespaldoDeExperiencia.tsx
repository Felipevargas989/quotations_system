import { useState } from "react";
import NumberInput from "../../components/inputs/NumberInput";
import { toast } from "../../components/toast/Toast";
import {
  leerOrdenDeCompra,
  type DatosDeRespaldo,
} from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { esOrdenDeCompra } from "./respaldos";

// LOS DATOS DE UN RESPALDO DE EXPERIENCIA (decisión 34 del doc 17, 19-10).
// Felipe bajaba a mano sus órdenes de compra para el anexo de experiencia:
// con el número de una orden, Eventia trae el resto (mandante, contrato,
// año y total) de su ficha pública de Mercado Público. Una factura se
// escribe a mano.

const CAMPO =
  "w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function RespaldoDeExperiencia({
  datos,
  onChange,
}: {
  readonly datos: DatosDeRespaldo;
  readonly onChange: (d: DatosDeRespaldo) => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const cambiar = (cambios: Partial<DatosDeRespaldo>) =>
    onChange({ ...datos, ...cambios });

  const completar = async () => {
    setBuscando(true);
    setAviso(null);
    try {
      const { orden, aviso: delMotor } = await leerOrdenDeCompra(datos.numero);
      onChange({
        numero: orden.numero,
        mandante: orden.mandante,
        contrato: orden.contrato,
        anio: orden.anio,
        monto: orden.monto,
        fuente: "mercado_publico",
      });
      setAviso(delMotor);
      toast.success("Datos traídos de Mercado Público.");
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo leer esa orden de compra."));
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p className="text-xs text-gray-500 mb-1">
          N° de orden de compra o de factura
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="N° de orden de compra o de factura"
            value={datos.numero}
            placeholder="4352-103-SE23"
            onChange={(e) =>
              cambiar({ numero: e.target.value, fuente: "manual" })
            }
            className={`${CAMPO} sm:w-56`}
          />
          <button
            type="button"
            onClick={() => void completar()}
            disabled={!esOrdenDeCompra(datos.numero) || buscando}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          >
            {buscando ? "Buscando…" : "Completar desde Mercado Público"}
          </button>
        </div>
        {aviso && <p className="mt-1 text-xs text-amber-700">{aviso}</p>}
      </div>
      <label className="block">
        <span className="block text-xs text-gray-500 mb-1">Mandante</span>
        <input
          value={datos.mandante ?? ""}
          onChange={(e) => cambiar({ mandante: e.target.value || null })}
          className={CAMPO}
        />
      </label>
      <label className="block">
        <span className="block text-xs text-gray-500 mb-1">Año</span>
        <input
          inputMode="numeric"
          value={datos.anio ?? ""}
          onChange={(e) => {
            const anio = Number(e.target.value.replace(/\D/g, "").slice(0, 4));
            cambiar({ anio: anio || null });
          }}
          className={CAMPO}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="block text-xs text-gray-500 mb-1">
          Nombre del contrato
        </span>
        <input
          value={datos.contrato ?? ""}
          onChange={(e) => cambiar({ contrato: e.target.value || null })}
          className={CAMPO}
        />
      </label>
      <label className="block">
        <span className="block text-xs text-gray-500 mb-1">
          Monto con impuestos ($)
        </span>
        <NumberInput
          value={datos.monto ?? undefined}
          onChange={(v) => cambiar({ monto: v ?? null })}
          min={0}
          currency
          className={CAMPO}
        />
      </label>
    </div>
  );
}
