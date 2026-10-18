import { AlertTriangle, Loader2 } from "lucide-react";
import type {
  ChoqueDeFecha,
  DecisionDelChoque,
} from "../services/quotations.service";

// El aviso rojo de un choque de fecha (Felipe, 18-10-2026; mapa 02 §5.6):
// «Choca con N° 500 · aceptada · 09-11 al 22-11», con «con exclusividad» si
// la aceptada la trae, y dos botones: «Sí, puede seguir» y «Hay que
// gestionar». Uno por cada aceptada con la que choca. En la tarjeta del
// tablero va compacto; en la ficha, a lo ancho bajo las fechas.
//
// Los clics no siguen de largo: la tarjeta entera abre la ficha.

const ddmm = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

export default function AvisoDeChoque({
  choques,
  puedeDecidir,
  decidiendo,
  onDecidir,
  compacto = false,
}: {
  readonly choques: ChoqueDeFecha[];
  /** Decidir es de quien vende; los demás solo ven el aviso. */
  readonly puedeDecidir: boolean;
  /** "quotationId|aceptadaId" del que se está guardando. */
  readonly decidiendo: string | null;
  readonly onDecidir: (
    choque: ChoqueDeFecha,
    decision: DecisionDelChoque,
  ) => void;
  readonly compacto?: boolean;
}) {
  if (choques.length === 0) return null;
  return (
    <div
      className={compacto ? "mt-2 space-y-1.5" : "mx-6 mt-3 space-y-2"}
      onClick={(e) => e.stopPropagation()}
    >
      {choques.map((c) => {
        const a = c.aceptada;
        const fechas =
          a.desde === a.hasta
            ? ddmm(a.desde)
            : `${ddmm(a.desde)} al ${ddmm(a.hasta)}`;
        const clave = `${c.quotation_id}|${a.id}`;
        const guardando = decidiendo === clave;
        return (
          <div
            key={clave}
            role="alert"
            className={`rounded-lg border border-red-200 bg-red-50 text-red-800 ${
              compacto ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"
            }`}
          >
            <div className="flex items-start gap-1.5">
              <AlertTriangle
                size={compacto ? 13 : 15}
                className="mt-0.5 shrink-0"
                aria-hidden
              />
              <span>
                Choca con <b>N° {a.numero}</b>
                {a.cliente ? ` · ${a.cliente}` : ""} · aceptada, {fechas}
                {a.exclusiva && <b> · con exclusividad</b>}
              </span>
            </div>
            {puedeDecidir && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => onDecidir(c, "puede_seguir")}
                  className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-300 hover:bg-emerald-50 disabled:opacity-60"
                  title="Se pueden hacer las dos: esta cotización sigue con su fecha. Queda anotado en el seguimiento."
                >
                  Sí, puede seguir
                </button>
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => onDecidir(c, "gestionar")}
                  className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  title="Deja una llamada para hoy en el seguimiento: mover la fecha o descartar."
                >
                  Hay que gestionar
                </button>
                {guardando && (
                  <Loader2
                    size={13}
                    className="animate-spin self-center"
                    aria-hidden
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
