import { AlertTriangle, ExternalLink, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { ArmadaConIA, FallidaConIA } from "../hooks/useCrearConIA";

// Lo que armó la IA en esta visita a Requerimientos (17-10-2026): cada una
// con su enlace al cotizador, para revisarla antes de enviarla. Las que no
// se pudieron, con el motivo que dio el motor.
const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

export default function ResultadosDeIA({
  armadas,
  fallidas,
  onCerrar,
}: {
  readonly armadas: ArmadaConIA[];
  readonly fallidas: FallidaConIA[];
  readonly onCerrar: () => void;
}) {
  if (armadas.length === 0 && fallidas.length === 0) return null;
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 font-semibold text-violet-900">
          <Sparkles size={16} aria-hidden />
          Armadas con IA: revísalas antes de enviarlas
        </p>
        <button
          type="button"
          onClick={onCerrar}
          className="text-violet-500 hover:text-violet-800"
          title="Cerrar"
        >
          <X size={16} />
        </button>
      </div>
      <ul className="space-y-1">
        {armadas.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-2">
            <span className="text-violet-900">
              N° {a.numero} · {clp(a.total)}
            </span>
            <Link
              to={`/quotation-form/${a.id}`}
              className="inline-flex items-center gap-1 font-medium text-violet-700 hover:text-violet-900"
            >
              <ExternalLink size={13} aria-hidden />
              Abrir en el cotizador
            </Link>
          </li>
        ))}
        {fallidas.map((f) => (
          <li
            key={`${f.id}-error`}
            className="flex items-start gap-1.5 text-amber-800"
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              N° {f.numero}: {f.motivo}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
