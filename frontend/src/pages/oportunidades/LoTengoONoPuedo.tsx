import { Check, X } from "lucide-react";
import type { MarcaDeExigencia } from "../../services/exigencias.service";

// ✓ LO TENGO / ✗ NO PUEDO (decisión 37, 19-10). Los mismos dos botones en
// «Bases y criterios», en las preguntas antes de armar y en «Lo que Eventia
// sabe de tu empresa» (decisión 119, parte 3): volver a apretar el marcado
// lo quita, salvo con `sinQuitar` (una respuesta guardada se cambia, no se
// deja en blanco).

export default function LoTengoONoPuedo({
  marca,
  onMarcar,
  deshabilitado = false,
  sinQuitar = false,
}: {
  readonly marca: MarcaDeExigencia | null | undefined;
  readonly onMarcar: (marca: MarcaDeExigencia | null) => void;
  readonly deshabilitado?: boolean;
  readonly sinQuitar?: boolean;
}) {
  const apretar = (cual: MarcaDeExigencia) => {
    if (marca !== cual) onMarcar(cual);
    else if (!sinQuitar) onMarcar(null);
  };
  return (
    <div className="flex shrink-0 gap-1.5">
      <button
        type="button"
        aria-pressed={marca === "lo_tengo"}
        disabled={deshabilitado}
        onClick={() => apretar("lo_tengo")}
        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border disabled:opacity-50 ${
          marca === "lo_tengo"
            ? "bg-green-600 border-green-600 text-white"
            : "bg-white border-gray-200 text-gray-600 hover:bg-green-50"
        }`}
      >
        <Check size={12} /> Lo tengo
      </button>
      <button
        type="button"
        aria-pressed={marca === "no_puedo"}
        disabled={deshabilitado}
        onClick={() => apretar("no_puedo")}
        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border disabled:opacity-50 ${
          marca === "no_puedo"
            ? "bg-red-600 border-red-600 text-white"
            : "bg-white border-gray-200 text-gray-600 hover:bg-red-50"
        }`}
      >
        <X size={12} /> No puedo
      </button>
    </div>
  );
}
