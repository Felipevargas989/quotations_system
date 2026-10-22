import { Gavel, Radar } from "lucide-react";
import type { ActaDeAdjudicacion } from "../../services/oportunidades.service";
import { formatCurrency } from "../../utils/currencies";

// QUIÉN GANÓ, SEGÚN EL ACTA PÚBLICA (decisión 30 del doc 17, 19-10). Felipe,
// con la gira de estudio: "quiero saber quién se la ganó, quién se la
// adjudicó, bajo qué condiciones". El radar lee el acta de lo que se sigue
// (y la guarda en mp_procesos.acta): cada ítem con todas sus ofertas.

const pesos = (n: number | null) =>
  n === null ? "sin monto" : formatCurrency(n, "CLP");

export default function ActaDeLaLicitacion({
  acta,
  seguida,
  estadoEnMercadoPublico,
}: {
  readonly acta: ActaDeAdjudicacion | null | undefined;
  readonly seguida: boolean;
  readonly estadoEnMercadoPublico: string | null;
}) {
  if (!acta) {
    if (!seguida) return null;
    return (
      <section className="bg-white rounded-lg shadow p-5 space-y-1">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-sky-800">
          <Radar size={15} /> En seguimiento
        </h2>
        <p className="text-sm text-gray-700">
          El radar la revisa una vez al día. Cuando Mercado Público publique el
          acta de adjudicación, aquí vas a ver quién ganó y qué ofreció cada
          uno, con sus precios.
        </p>
        <p className="text-xs text-gray-500">
          Hoy en Mercado Público: {estadoEnMercadoPublico ?? "sin estado"}.
        </p>
      </section>
    );
  }

  const ganadores = acta.items.flatMap((i) =>
    i.ofertas.filter((o) => o.adjudicada).map((o) => o.proveedor),
  );
  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-4">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Gavel size={15} /> Quién ganó, según el acta
        </h2>
        <p className="text-xs text-gray-500">
          {[
            acta.informada ? `Informada el ${acta.informada}` : null,
            `Monto neto adjudicado: ${pesos(acta.monto_adjudicado)}`,
            ganadores.length === 0
              ? "Nadie quedó adjudicado"
              : `Ganó ${[...new Set(ganadores)].join(", ")}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {acta.items.map((item) => (
        <div key={item.numero} className="space-y-1.5">
          <p className="text-sm font-semibold text-gray-900">
            {item.numero}. {item.producto || "Ítem"}
            {item.cantidad ? ` · cantidad ${item.cantidad}` : ""}
          </p>
          {item.especificacion && (
            <p className="text-xs text-gray-600">{item.especificacion}</p>
          )}
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {[...item.ofertas]
              .sort(
                (a, b) =>
                  Number(b.adjudicada) - Number(a.adjudicada) ||
                  (a.precio_unitario ?? 0) - (b.precio_unitario ?? 0),
              )
              .map((o) => (
                <li
                  key={`${o.rut ?? o.proveedor}-${o.precio_unitario}`}
                  className="px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-gray-900">
                      {o.proveedor}
                    </span>
                    {o.rut && (
                      <span className="text-xs text-gray-500">{o.rut}</span>
                    )}
                    <span className="ml-auto font-semibold text-gray-900">
                      {pesos(o.precio_unitario)}
                      <span className="text-xs font-normal text-gray-500">
                        {" "}
                        neto unitario
                      </span>
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs rounded ${
                        o.adjudicada
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {o.adjudicada ? "Ganó" : "No adjudicada"}
                    </span>
                  </div>
                  {o.detalle && (
                    <p className="text-xs text-gray-600 mt-0.5">{o.detalle}</p>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
