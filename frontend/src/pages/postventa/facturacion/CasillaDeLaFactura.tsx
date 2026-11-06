import RutInput from "../../../components/inputs/RutInput";
import { claseCasilla } from "./datosDeLaFactura";

// La casilla de la factura del evento (doc 19, paso 2c), con su contador.
// La del RUT va con el mismo título y el mismo alto, para que queden
// alineadas en la misma fila (Felipe, 05-11: «ordenemos las cajitas»).

/** Una casilla con su contador: lo que cabe en la factura. */
export default function CasillaDeLaFactura({
  etiqueta,
  valor,
  largo,
  placeholder,
  onChange,
}: {
  readonly etiqueta: string;
  readonly valor: string | null;
  readonly largo?: number;
  readonly placeholder?: string;
  readonly onChange: (v: string) => void;
}) {
  const n = Array.from(valor ?? "").length;
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-gray-500">
        {etiqueta}
        {largo && (
          <span className={n > largo ? "font-semibold text-red-600" : ""}>
            {n}/{largo}
          </span>
        )}
      </span>
      <input
        type="text"
        value={valor ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={claseCasilla}
      />
    </label>
  );
}

/** El RUT, con el título y el alto de las demás casillas. */
export function CasillaDelRut({
  valor,
  onChange,
}: {
  readonly valor: string;
  readonly onChange: (rut: string) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-gray-500">RUT</span>
      <RutInput
        value={valor}
        onChange={(rut) => onChange(rut)}
        placeholder="12.345.678-9"
        className="text-sm !py-1.5"
      />
    </label>
  );
}
