import { AlertTriangle, Loader2 } from "lucide-react";
import type {
  ChoqueDeFecha,
  DecisionDelChoque,
} from "../services/quotations.service";

// El aviso rojo de un choque de fecha (Felipe, 18-10-2026; mapa 02 §5.6):
// «Choca con N° 500 · aceptada · 09-11 al 22-11», con «con exclusividad» si
// la aceptada la trae, y dos botones: «Sí, puede seguir» y «Hay que
// gestionar». Uno por cada aceptada con la que choca: cada choque se revisa
// por separado (sin atajo). En la tarjeta del tablero va compacto; en la
// ficha, a lo ancho bajo las fechas.
//
// Después de «Hay que gestionar» queda la viñeta «Tope de calendario»
// (Felipe, 18-10: "si dice simplemente «Tope de calendario» y el borde rojo,
// es suficiente"): UNA sola aunque sean dos o tres ("inclusive si son dos o
// 3 debería mostrar un solo aviso"), con el detalle al pasar el mouse y un
// solo botón, «Sí, puede seguir», que los cierra todos: lo que se decide es
// que esta cotización sigue con su fecha.
//
// Los clics no siguen de largo: la tarjeta entera abre la ficha.

const ddmm = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

const fechasDe = (c: ChoqueDeFecha) =>
  c.aceptada.desde === c.aceptada.hasta
    ? ddmm(c.aceptada.desde)
    : `${ddmm(c.aceptada.desde)} al ${ddmm(c.aceptada.hasta)}`;

const detalleDe = (c: ChoqueDeFecha) =>
  `Con la N° ${c.aceptada.numero}${c.aceptada.cliente ? ` · ${c.aceptada.cliente}` : ""} · aceptada, ${fechasDe(c)}${c.aceptada.exclusiva ? " · con exclusividad" : ""}`;

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
  /** La cotización cuya decisión se está guardando. */
  readonly decidiendo: string | null;
  /** Una decisión para uno o varios choques de la misma cotización. */
  readonly onDecidir: (
    choques: ChoqueDeFecha[],
    decision: DecisionDelChoque,
  ) => void;
  readonly compacto?: boolean;
}) {
  if (choques.length === 0) return null;
  const topes = choques.filter((c) => c.estado === "gestionar");
  const porRevisar = choques.filter((c) => c.estado !== "gestionar");
  const guardando =
    decidiendo !== null && choques.some((c) => c.quotation_id === decidiendo);

  const seguir = (lista: ChoqueDeFecha[]) => (
    <button
      type="button"
      disabled={guardando}
      onClick={() => onDecidir(lista, "puede_seguir")}
      className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-300 hover:bg-emerald-50 disabled:opacity-60"
      title={
        lista.length > 1
          ? `Esta cotización sigue con su fecha: cierra los ${lista.length} topes. Queda anotado en el seguimiento.`
          : "Se pueden hacer las dos: esta cotización sigue con su fecha. Queda anotado en el seguimiento."
      }
    >
      Sí, puede seguir
    </button>
  );
  const rueda = guardando && (
    <Loader2 size={13} className="animate-spin self-center" aria-hidden />
  );

  return (
    <div
      className={compacto ? "mt-2 space-y-1.5" : "mx-6 mt-3 space-y-2"}
      onClick={(e) => e.stopPropagation()}
    >
      {topes.length > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white"
            title={`${topes.map(detalleDe).join("\n")}\nSe quita solo si cambia la fecha o se cierra la cotización; o con «Sí, puede seguir».`}
          >
            <AlertTriangle size={12} aria-hidden />
            Tope de calendario
          </span>
          {puedeDecidir && seguir(topes)}
          {rueda}
        </div>
      )}
      {porRevisar.map((c) => (
        <div
          key={`${c.quotation_id}|${c.aceptada.id}`}
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
              Choca con <b>N° {c.aceptada.numero}</b>
              {c.aceptada.cliente ? ` · ${c.aceptada.cliente}` : ""} · aceptada,{" "}
              {fechasDe(c)}
              {c.aceptada.exclusiva && <b> · con exclusividad</b>}
            </span>
          </div>
          {puedeDecidir && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {seguir([c])}
              <button
                type="button"
                disabled={guardando}
                onClick={() => onDecidir([c], "gestionar")}
                className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                title="Deja una llamada para hoy en el seguimiento (mover la fecha o descartar) y la marca «Tope de calendario»."
              >
                Hay que gestionar
              </button>
              {rueda}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
