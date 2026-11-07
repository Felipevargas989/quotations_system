import { PLAZOS_DE_PAGO } from "../../../constants/facturacion";
import type { DtePedido } from "../../../services/facturas.service";
import { fechaCorta } from "../../../utils/ordenesDeCompra";

// LA CONDICIÓN DE PAGO DE LA FACTURA (doc 19 §9.22), la misma en el evento
// y en «Nuevo documento». Felipe, 06-11: *"por defecto la factura debe ser
// emitida en crédito a 30 días... o 45 o 60"*, y no en cualquier fecha:
// el vencimiento sale de la emisión más el plazo, igual que en el motor.
// Al contado no queda nada por cobrar; a crédito, hasta que vence. Más de
// 30 días lo permite la ley de pago a 30 días (Ley 19.983) solo con las
// bases de una licitación pública o con un acuerdo inscrito.

/** La fecha más los días, como la cuenta el motor (AAAA-MM-DD). */
const sumarDias = (iso: string, n: number) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const boton = (activo: boolean) =>
  `rounded-md px-3 py-1.5 text-xs font-semibold ${activo ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`;
const grupo = "inline-flex rounded-lg border border-gray-300 bg-white p-0.5";

export default function CondicionDePago({
  pedida,
  fecha,
  onChange,
}: {
  readonly pedida: DtePedido;
  /** La fecha de emisión que dice el motor (AAAA-MM-DD). */
  readonly fecha: string | null;
  readonly onChange: (
    cambios: Pick<DtePedido, "forma_de_pago" | "plazo_dias">,
  ) => void;
}) {
  const contado = pedida.forma_de_pago === 1;
  const dias = pedida.plazo_dias ?? 30;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="space-y-1">
          <p id="condicion-de-pago" className="text-xs text-gray-500">
            Condición de pago
          </p>
          <div
            role="radiogroup"
            aria-labelledby="condicion-de-pago"
            className={grupo}
          >
            <button
              type="button"
              role="radio"
              aria-checked={contado}
              onClick={() => onChange({ forma_de_pago: 1, plazo_dias: null })}
              className={boton(contado)}
            >
              Contado
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!contado}
              onClick={() => onChange({ forma_de_pago: 2, plazo_dias: dias })}
              className={boton(!contado)}
            >
              Crédito
            </button>
          </div>
        </div>
        {!contado && (
          <div className="space-y-1">
            <p id="plazo-de-pago" className="text-xs text-gray-500">
              Plazo
            </p>
            <div
              role="radiogroup"
              aria-labelledby="plazo-de-pago"
              className={grupo}
            >
              {PLAZOS_DE_PAGO.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={dias === d}
                  onClick={() => onChange({ forma_de_pago: 2, plazo_dias: d })}
                  className={boton(dias === d)}
                >
                  {d} días
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="pb-1.5 text-xs text-gray-600">
          {contado ? (
            "Se paga al emitirla: no queda por cobrar."
          ) : fecha ? (
            <>
              Vence el{" "}
              <span className="font-semibold text-gray-900">
                {fechaCorta(sumarDias(fecha, dias))}
              </span>
              : queda por cobrar hasta entonces.
            </>
          ) : (
            "Queda por cobrar hasta que vence."
          )}
        </p>
      </div>
      {!contado && dias > 30 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Más de 30 días solo si lo dicen las bases de una licitación pública
          (hasta 60), o con un acuerdo escrito inscrito en el Ministerio de
          Economía (Ley 19.983).
        </p>
      )}
    </div>
  );
}
