import { Lock } from "lucide-react";
import RutInput from "../../../components/inputs/RutInput";
import { claseCasilla, claseTitulo } from "./datosDeLaFactura";

// La casilla de la factura del evento (doc 19, paso 2c), con su contador.
// La del RUT va con el mismo título y el mismo alto, para que queden
// alineadas en la misma fila (Felipe, 05-11: «ordenemos las cajitas»).
//
// Bloqueada (§9.27; Felipe, 08-11: *"el resto se rellena solo y se
// achura"*): lo que trajo el RUT, en gris y con candado, para no tocarlo
// por error. Se lee y se copia, pero no se escribe; se abre con «Corregir
// datos». El mismo alto que las demás.
const claseBloqueada =
  "w-full cursor-default truncate rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm text-gray-600 focus:outline-none";

/** Una casilla con su contador: lo que cabe en la factura. */
export default function CasillaDeLaFactura({
  etiqueta,
  valor,
  largo,
  placeholder,
  onChange,
  bloqueada = false,
  falta = false,
}: {
  readonly etiqueta: string;
  readonly valor: string | null;
  readonly largo?: number;
  readonly placeholder?: string;
  readonly onChange: (v: string) => void;
  /** Lo que trajo el RUT: achurado, sin contador. */
  readonly bloqueada?: boolean;
  /** §9.32: lo que el SII pide y no está, en rojo en su casilla (en vez de
   *  un aviso aparte). */
  readonly falta?: boolean;
}) {
  const n = Array.from(valor ?? "").length;
  return (
    <label className="block">
      <span className={claseTitulo}>
        <span>
          {etiqueta}
          {falta && (
            <span className="font-semibold text-red-600"> · falta</span>
          )}
        </span>
        {largo && !bloqueada && (
          <span className={n > largo ? "font-semibold text-red-600" : ""}>
            {n}/{largo}
          </span>
        )}
      </span>
      {bloqueada ? (
        <span className="relative block">
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={valor ?? ""}
            readOnly
            title={valor ?? ""}
            className={claseBloqueada}
          />
        </span>
      ) : (
        <input
          type="text"
          value={valor ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${claseCasilla} ${falta ? "!border-red-400" : ""}`}
        />
      )}
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
      <span className={claseTitulo}>RUT</span>
      <RutInput
        value={valor}
        onChange={(rut) => onChange(rut)}
        placeholder="12.345.678-9"
        className="text-sm"
      />
    </label>
  );
}
