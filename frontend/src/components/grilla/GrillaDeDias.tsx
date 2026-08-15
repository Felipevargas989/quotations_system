import type { ReactNode } from "react";
import { Minus, Plus, X } from "lucide-react";

// LA GRILLA DE DÍAS — PIEZA DE LA CASA (15-08, pedido de Felipe:
// "deja esta grilla como una pieza, por si la volvemos a ocupar").
//
// Días en las columnas, filas con un contador por día, y TRES columnas de
// valores a la derecha más una de acción. La usan el Personal y los
// Arriendos de la pestaña Gestión.
//
// LOS ANCHOS SON FIJOS Y LOS MISMOS PARA TODAS LAS INSTANCIAS
// (corrección de Felipe, 15-08): cuando dos grillas muestran los mismos
// días, sus columnas COINCIDEN una sobre otra. Por eso el `colgroup` con
// `table-fixed`: título w-56, valores w-28 ×3, acción w-10, y los días se
// reparten parejos lo que sobra.
//
// El ✕ de quitar un día va AL LADO del número, rojo y visible
// (corrección de Felipe: "que sea evidente su funcionalidad"). Solo lo
// llevan los días agregados a mano — los del evento no se pueden quitar.

export const rotuloDia = (isoDia: string) => {
  const d = new Date(`${isoDia}T12:00:00Z`);
  return {
    dia: d
      .toLocaleDateString("es-CL", { weekday: "short", timeZone: "UTC" })
      .replace(".", ""),
    num: d.getUTCDate(),
    mes: d
      .toLocaleDateString("es-CL", { month: "short", timeZone: "UTC" })
      .replace(".", ""),
  };
};

export interface FilaGrillaDias {
  readonly id: number | string;
  /** Nombre más sus apuntes (proveedor, chips, "sin día"). */
  readonly titulo: ReactNode;
  readonly cantidadEn: (dia: string) => number;
  readonly onCambiar: (dia: string, nueva: number) => void;
  /** Apaga el + de toda la fila (ej: recurso huérfano). */
  readonly masDeshabilitado?: boolean;
  /** Las tres celdas de la derecha, en el orden de `titulosValores`. */
  readonly valores: readonly [ReactNode, ReactNode, ReactNode];
  /** La celda de acción del final (ej: quitar la fila). */
  readonly accion?: ReactNode;
}

export interface PieGrillaDias {
  readonly etiqueta: string;
  /** Un número por día (ej: jornadas). Sin esto, los días quedan vacíos. */
  readonly porDia?: (dia: string) => ReactNode;
  readonly valores: readonly [ReactNode, ReactNode, ReactNode];
}

export default function GrillaDeDias({
  dias,
  diasFijos,
  congelado = false,
  onQuitarDia,
  columnaTitulo,
  titulosValores,
  filas,
  pie,
}: {
  readonly dias: readonly string[];
  /** Los días propios del evento: no llevan ✕. */
  readonly diasFijos: ReadonlySet<string>;
  readonly congelado?: boolean;
  readonly onQuitarDia: (dia: string) => void;
  readonly columnaTitulo: string;
  readonly titulosValores: readonly [string, string, string];
  readonly filas: readonly FilaGrillaDias[];
  readonly pie?: PieGrillaDias;
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm table-fixed min-w-[56rem]">
        <colgroup>
          <col className="w-56" />
          {dias.map((d) => (
            <col key={d} />
          ))}
          <col className="w-28" />
          <col className="w-28" />
          <col className="w-28" />
          <col className="w-10" />
        </colgroup>
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2 text-left font-medium text-gray-500">
              {columnaTitulo}
            </th>
            {dias.map((d) => {
              const r = rotuloDia(d);
              const quitable = !diasFijos.has(d) && !congelado;
              return (
                <th
                  key={d}
                  className="px-2 py-2 text-center font-medium text-gray-600"
                >
                  {/* El ✕ va junto al NOMBRE del día — "sáb ✕" — no al
                      número (corrección de Felipe, 15-08). */}
                  <div className="flex items-center justify-center gap-1 text-[11px] text-gray-400 leading-none">
                    <span>{r.dia}</span>
                    {quitable && (
                      <button
                        type="button"
                        onClick={() => onQuitarDia(d)}
                        aria-label={`Quitar el día ${d}`}
                        title="Quitar este día"
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="leading-tight">{r.num}</div>
                  <div className="text-[11px] text-gray-400 leading-none">
                    {r.mes}
                  </div>
                </th>
              );
            })}
            {titulosValores.map((t, i) => (
              <th
                key={`${t}-${String(i)}`}
                className="px-2 py-2 text-right font-medium text-gray-500"
              >
                {t}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas.map((f) => (
            <tr key={f.id}>
              <td className="px-3 py-2 text-gray-900">{f.titulo}</td>
              {dias.map((d) => {
                const cant = f.cantidadEn(d);
                return (
                  <td key={d} className="px-1 py-1 text-center">
                    <div className="inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        disabled={congelado || cant <= 0}
                        onClick={() => f.onCambiar(d, cant - 1)}
                        aria-label={`Uno menos el ${d}`}
                        className="p-0.5 text-gray-300 hover:text-red-600 disabled:opacity-30"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span
                        className={`w-6 text-center tabular-nums ${
                          cant > 0
                            ? "text-gray-900 font-medium"
                            : "text-gray-300"
                        }`}
                      >
                        {cant > 0 ? cant : "·"}
                      </span>
                      <button
                        type="button"
                        disabled={congelado || f.masDeshabilitado}
                        onClick={() => f.onCambiar(d, cant + 1)}
                        aria-label={`Uno más el ${d}`}
                        className="p-0.5 text-gray-300 hover:text-blue-600 disabled:opacity-30"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                );
              })}
              {f.valores.map((v, i) => (
                <td
                  key={`v-${String(i)}`}
                  className="px-2 py-1.5 text-right tabular-nums text-gray-700"
                >
                  {v}
                </td>
              ))}
              <td className="px-1 py-1 text-center">{f.accion}</td>
            </tr>
          ))}
        </tbody>
        {pie && (
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td className="px-3 py-2 text-gray-500">{pie.etiqueta}</td>
              {pie.porDia ? (
                dias.map((d) => (
                  <td
                    key={d}
                    className="px-2 py-2 text-center tabular-nums font-semibold text-gray-900"
                  >
                    {pie.porDia!(d)}
                  </td>
                ))
              ) : (
                <td colSpan={dias.length} />
              )}
              {pie.valores.map((v, i) => (
                <td
                  key={`p-${String(i)}`}
                  className="px-2 py-2 text-right tabular-nums font-bold text-gray-900"
                >
                  {v}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
