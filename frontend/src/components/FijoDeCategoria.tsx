import { useState } from "react";
import { Lock, X } from "lucide-react";
import ConfirmInline from "./ConfirmInline";

/**
 * EL SELLO «FIJO» DE UN ÍTEM DE LA SECCIÓN FIJA, con su excepción.
 *
 * Los ítems de la sección fija de una categoría entran solos y van con
 * candado: el 99% de las veces es lo correcto (Felipe, 09-09). La
 * excepción es un cliente puntual que no lo quiere (CCU, la bebida del
 * almuerzo en la #408): acá se quita SOLO en esta cotización, con
 * confirmación para que no sea un clic accidental. El catálogo no se
 * toca y la próxima casilla vuelve a traerlo.
 *
 * Misma pieza en el cotizador y en Servicios de Post-Venta.
 */
export default function FijoDeCategoria({
  categoria,
  onQuitar,
  disabled = false,
}: {
  readonly categoria: string;
  readonly onQuitar: () => void;
  readonly disabled?: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  if (confirmando) {
    return (
      <ConfirmInline
        question={`Es fijo de ${categoria}. ¿Quitarlo solo en esta cotización?`}
        yesLabel="Sí, quitar"
        onYes={() => {
          setConfirmando(false);
          onQuitar();
        }}
        onNo={() => setConfirmando(false)}
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <span
        title="Va siempre con esta categoría (sección fija)"
        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5"
      >
        <Lock size={10} /> fijo
      </span>
      {!disabled && (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="text-gray-300 hover:text-red-600"
          title="Quitarlo solo en esta cotización"
          aria-label={`Quitar ${categoria} fijo de esta cotización`}
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}
