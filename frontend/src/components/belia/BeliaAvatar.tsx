import { PawPrint } from "lucide-react";
import type { Animo } from "./belia";

// LA CARA DE BELIA. Provisoria hasta que llegue su dibujo en SVG (doc 20
// §8b): un círculo con una huella, que cambia de color y se mueve según el
// ánimo. Cuando llegue el dibujo, cambia solo lo de adentro de este
// archivo; la ventanilla le sigue pasando el mismo `animo`.

const COLOR: Record<Animo, string> = {
  espera: "from-blue-500 to-blue-700",
  pensando: "from-blue-500 to-indigo-600",
  atencion: "from-amber-400 to-orange-500",
  enojada: "from-rose-500 to-red-600",
  celebra: "from-emerald-400 to-teal-600",
  dormida: "from-slate-400 to-slate-500",
};

// Cada movimiento termina (la regla de «vibrar»), salvo respirar dormida.
const MOVIMIENTO: Record<Animo, string> = {
  espera: "",
  pensando: "animate-pulse",
  atencion: "animate-belia-saltito",
  enojada: "animate-belia-sacudida",
  celebra: "animate-belia-saltito",
  dormida: "animate-belia-respirar",
};

type Props = {
  animo: Animo;
  /** Diámetro en px. */
  tamano?: number;
};

export default function BeliaAvatar({ animo, tamano = 56 }: Props) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white ${COLOR[animo]} ${MOVIMIENTO[animo]}`}
      style={{ width: tamano, height: tamano }}
    >
      <PawPrint
        size={Math.round(tamano * 0.46)}
        strokeWidth={2.2}
        className={animo === "dormida" ? "opacity-70" : ""}
      />
      {animo === "dormida" && (
        <span className="animate-belia-zzz absolute -right-1 -top-2 text-xs font-bold text-slate-500">
          z z
        </span>
      )}
      {animo === "pensando" && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-indigo-600 shadow">
          ?
        </span>
      )}
    </span>
  );
}
