import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";

// UNA LÍNEA QUE SE ABRE (los plegables de «Bases y criterios», decisión 80
// del doc 17, 26-10): el título con su flecha y, al abrirla, lo de adentro.
// Felipe: "me gusta que existan estos plegables".

export default function Plegable({
  titulo,
  abierto: deEntrada = false,
  children,
}: {
  readonly titulo: string;
  /** Abierta de partida. */
  readonly abierto?: boolean;
  readonly children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(deEntrada);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
      >
        {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {titulo}
      </button>
      {abierto && children}
    </div>
  );
}
