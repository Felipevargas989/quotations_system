import { AlertTriangle, Loader2 } from "lucide-react";
import type { ChoqueDeFecha } from "../services/quotations.service";

// El tope de calendario (Felipe, 18-10-2026; mapa 02 §5.6): una cotización
// viva cuyas fechas se topan con las de una aceptada. Desde el primer
// momento es «Tope de calendario», con borde rojo en la tarjeta y en el
// hilo de seguimiento, hasta que deja de existir: se cambia la fecha o se
// cierra la cotización (se va solo), o alguien aprieta «Sí, puede seguir».
// El botón «Hay que gestionar» se quitó: "hay dos caminos: o se edita y se
// cancela, o se puede seguir; el paso del botón hay que gestionar está
// perdido".
//
// En la tarjeta del tablero (compacto): UNA viñeta «Tope de calendario»
// aunque sean dos o tres, con el detalle al pasar el mouse. En la ficha,
// bajo las fechas: el detalle de cada tope (N°, cliente, fechas y si trae
// exclusividad). En los dos, un solo «Sí, puede seguir» que los cierra
// todos: lo que se decide es que esta cotización sigue con su fecha.
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
  guardando,
  onSeguir,
  compacto = false,
}: {
  /** Los topes de UNA cotización. */
  readonly choques: ChoqueDeFecha[];
  /** «Sí, puede seguir» es de quien vende; los demás solo ven el tope. */
  readonly puedeDecidir: boolean;
  readonly guardando: boolean;
  readonly onSeguir: (choques: ChoqueDeFecha[]) => void;
  readonly compacto?: boolean;
}) {
  if (choques.length === 0) return null;
  const seguir = puedeDecidir && (
    <button
      type="button"
      disabled={guardando}
      onClick={() => onSeguir(choques)}
      className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-300 hover:bg-emerald-50 disabled:opacity-60"
      title={
        choques.length > 1
          ? `Esta cotización sigue con su fecha: cierra los ${choques.length} topes. Queda anotado en el seguimiento.`
          : "Se pueden hacer las dos: esta cotización sigue con su fecha. Queda anotado en el seguimiento."
      }
    >
      Sí, puede seguir
    </button>
  );
  const rueda = guardando && (
    <Loader2 size={13} className="animate-spin self-center" aria-hidden />
  );
  const vineta = (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white"
      title={`${choques.map(detalleDe).join("\n")}\nSe quita solo si cambia la fecha o se cierra la cotización; o con «Sí, puede seguir».`}
    >
      <AlertTriangle size={12} aria-hidden />
      Tope de calendario
    </span>
  );

  if (compacto) {
    return (
      <div
        role="status"
        className="mt-2 flex flex-wrap items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        {vineta}
        {seguir}
        {rueda}
      </div>
    );
  }
  return (
    <div
      role="status"
      className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {vineta}
        {seguir}
        {rueda}
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {choques.map((c) => (
          <li key={c.aceptada.id}>
            Choca con <b>N° {c.aceptada.numero}</b>
            {c.aceptada.cliente ? ` · ${c.aceptada.cliente}` : ""} · aceptada,{" "}
            {fechasDe(c)}
            {c.aceptada.exclusiva && <b> · con exclusividad</b>}
          </li>
        ))}
      </ul>
    </div>
  );
}
