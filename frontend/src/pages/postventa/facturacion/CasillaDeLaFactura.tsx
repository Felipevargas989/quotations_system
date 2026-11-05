import { claseCasilla } from "./datosDeLaFactura";

// La casilla de la factura del evento (doc 19, paso 2c), con su contador.

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
