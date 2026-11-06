import { useState } from "react";
import { X } from "lucide-react";
import BoletaSuelta from "../boletas/BoletaSuelta";
import ElegirDocumento from "./ElegirDocumento";
import FacturaNueva from "./FacturaNueva";

// «NUEVO DOCUMENTO» (doc 19 §9.21). Felipe, 06-11: *"un botón de crear
// nuevo DTE que me pregunte si va a ser nota de crédito, débito, factura,
// boleta, y crearla de cero"*, y que la recepcionista emita ahí las boletas
// de las cabañas. Cada uno ve solo lo que puede emitir (lo decide la
// sección); con una sola opción, va directo a ella.

export type TipoNuevo = "factura" | "boleta" | "nota_credito" | "nota_debito";

const NOMBRE: Record<TipoNuevo, string> = {
  factura: "Factura",
  boleta: "Boleta",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
};

export default function NuevoDocumento({
  tipos,
  esAdmin,
  onCerrar,
  onEmitido,
}: {
  readonly tipos: TipoNuevo[];
  readonly esAdmin: boolean;
  readonly onCerrar: () => void;
  readonly onEmitido: () => void;
}) {
  const [tipo, setTipo] = useState<TipoNuevo | null>(
    tipos.length === 1 ? tipos[0] : null,
  );
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-center justify-between gap-3">
        {tipos.length > 1 ? (
          <div className="inline-flex flex-wrap rounded-lg border border-gray-300 bg-white p-0.5">
            {tipos.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${tipo === t ? "bg-violet-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                {NOMBRE[t]}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm font-semibold text-violet-900">
            {NOMBRE[tipos[0]]}
          </p>
        )}
        <button
          type="button"
          onClick={onCerrar}
          title="Cerrar sin emitir"
          className="text-gray-400 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      </div>
      {tipo === "factura" && (
        <FacturaNueva puedeEmitir={esAdmin} onEmitida={onEmitido} />
      )}
      {tipo === "boleta" && (
        <BoletaSuelta esAdmin={esAdmin} onEmitida={onEmitido} />
      )}
      {(tipo === "nota_credito" || tipo === "nota_debito") && (
        <ElegirDocumento key={tipo} tipo={tipo} onEmitida={onEmitido} />
      )}
    </div>
  );
}
