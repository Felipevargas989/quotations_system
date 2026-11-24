import { Star } from "lucide-react";
import {
  UNIT_FAMILY_INFO,
  type Supply,
} from "../../../../types/logistics.types";
import type { CostoDeUnaCompra } from "../../../../services/stock.service";

// LOS INSUMOS VIGILADOS (doc 25 D18, 24-11-2026). Felipe: *"dejemos la parte
// de stock como un módulo de costos que vamos a ir monitoreando ciertos
// costos"*. Cada tarjeta, siempre en el mismo orden: el insumo, su costo de
// hoy, cuánto se movió en la última compra y de dónde salió. Se marcan con
// la estrella de la tabla de abajo.

const fmt = (v: number) =>
  `$${v.toLocaleString("es-CL", { maximumFractionDigits: v < 100 ? 2 : 0 })}`;

const dia = (f: string | null) =>
  f ? `${f.slice(8, 10)}-${f.slice(5, 7)}` : "";

/** La línea de los últimos costos, del más viejo al de hoy. */
function Tendencia({ puntos }: { readonly puntos: number[] }) {
  if (puntos.length < 2) return null;
  const min = Math.min(...puntos);
  const max = Math.max(...puntos);
  const alto = 22;
  const ancho = 72;
  const xy = puntos.map((p, i) => {
    const x = (i / (puntos.length - 1)) * ancho;
    const y = max === min ? alto / 2 : alto - ((p - min) / (max - min)) * alto;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const sube = puntos[puntos.length - 1] > puntos[0];
  return (
    <svg width={ancho} height={alto + 2} className="overflow-visible">
      <polyline
        points={xy.join(" ")}
        fill="none"
        strokeWidth={2}
        className={sube ? "stroke-red-500" : "stroke-green-600"}
      />
    </svg>
  );
}

export default function InsumosVigilados({
  supplies,
  vigilados,
  historial,
}: {
  readonly supplies: Supply[];
  readonly vigilados: number[];
  readonly historial: Record<number, CostoDeUnaCompra[]>;
}) {
  const lista = supplies
    .filter((s) => vigilados.includes(s.id))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <Star size={17} className="text-amber-500 fill-amber-400" />
        <h3 className="text-base font-bold text-gray-900">Insumos vigilados</h3>
        <span className="text-xs text-gray-400">· {lista.length}</span>
      </div>
      {!lista.length ? (
        <p className="text-sm text-gray-500">
          Marca con la estrella, en la tabla de abajo, los insumos que quieres
          seguir.
        </p>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {lista.map((s) => {
            const base = UNIT_FAMILY_INFO[s.unit_family]?.base ?? "";
            const h = historial[s.id] ?? [];
            const ultima = h[0];
            const hoy = Number(s.price) || 0;
            const antes = ultima?.antes ?? null;
            const pct =
              antes && hoy ? Math.round(((hoy - antes) / antes) * 100) : null;
            const puntos = [
              ...(h.length && h[h.length - 1].antes
                ? [h[h.length - 1].antes as number]
                : []),
              ...[...h].reverse().map((c) => c.costo),
            ];
            return (
              <div
                key={s.id}
                className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm"
              >
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {s.name}
                </p>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <p className="text-xl font-bold text-gray-900 tabular-nums">
                    {hoy ? fmt(hoy) : "—"}
                    <span className="text-xs font-normal text-gray-400">
                      /{base}
                    </span>
                  </p>
                  <Tendencia puntos={puntos} />
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  {pct === null ? (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">
                      {ultima ? "igual" : "sin compras"}
                    </span>
                  ) : (
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold tabular-nums ${
                        pct > 0
                          ? "bg-red-100 text-red-700"
                          : pct < 0
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {pct > 0 ? "▲" : pct < 0 ? "▼" : ""} {Math.abs(pct)} %
                    </span>
                  )}
                  {antes ? (
                    <span className="text-gray-500 tabular-nums">
                      antes {fmt(antes)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-gray-400 truncate">
                  {ultima
                    ? [dia(ultima.fecha), ultima.proveedor, ultima.equivalente]
                        .filter(Boolean)
                        .join(" · ")
                    : "Aún no se sube una compra de este insumo"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
