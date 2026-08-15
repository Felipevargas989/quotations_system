import { Fragment, type ReactNode } from "react";
import { X } from "lucide-react";
import QuantitySelector from "../QuantitySelector";

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
  /** Las tres celdas de la derecha, en el orden de `titulosValores`.
   *  v2.0: opcionales — la sábana de planificación no las lleva. */
  readonly valores?: readonly [ReactNode, ReactNode, ReactNode];
  /** La celda de acción del final (ej: quitar la fila). */
  readonly accion?: ReactNode;
  /** v2.0: banda de grupo (ej: el evento). Filas contiguas con el mismo
   *  grupo comparten UNA banda. */
  readonly grupo?: string;
  /** La banda lleva una línea divisoria gruesa arriba (ej: el
   *  Restaurante, separado de los eventos). */
  readonly grupoDestacado?: boolean;
  /** v2.1: un control a la derecha de la banda (ej: "+ cargo"). */
  readonly grupoAccion?: ReactNode;
  /** v2.0: pinta la celda a su manera (la sábana pone su tiene/necesita).
   *  Sin esto, la celda es el contador de siempre. */
  readonly renderCelda?: (dia: string) => ReactNode;
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
  resaltarDia,
  onDiaClick,
}: {
  readonly dias: readonly string[];
  /** Los días propios del evento: no llevan ✕. */
  readonly diasFijos: ReadonlySet<string>;
  readonly congelado?: boolean;
  readonly onQuitarDia: (dia: string) => void;
  readonly columnaTitulo: string;
  /** v2.0: opcionales — sin ellos no se pintan las columnas de valores. */
  readonly titulosValores?: readonly [string, string, string];
  readonly filas: readonly FilaGrillaDias[];
  readonly pie?: PieGrillaDias;
  /** v2.0: el día a resaltar (normalmente hoy). */
  readonly resaltarDia?: string;
  /** v2.1: pinchar el encabezado de un día (la sábana abre su resumen). */
  readonly onDiaClick?: (dia: string) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm table-fixed min-w-[56rem]">
        <colgroup>
          <col className="w-56" />
          {dias.map((d) => (
            <col key={d} />
          ))}
          {titulosValores && (
            <>
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-10" />
            </>
          )}
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
                  className={`px-2 py-2 text-center font-medium ${
                    d === resaltarDia ? "text-blue-700" : "text-gray-600"
                  }`}
                >
                  {/* El ✕ va junto al NOMBRE del día — "sáb ✕" — y el
                      espaciador invisible del mismo ancho al otro lado
                      mantiene el nombre CENTRADO igual que el número y el
                      mes (corrección de Felipe, 15-08). */}
                  <div className="flex items-center justify-center gap-1 text-[11px] text-gray-400 leading-none">
                    {quitable && <span className="w-4" aria-hidden="true" />}
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
                  {onDiaClick ? (
                    <button
                      type="button"
                      onClick={() => onDiaClick(d)}
                      title="Ver el resumen del día"
                      className="leading-tight hover:text-blue-700 hover:underline"
                    >
                      {r.num}
                    </button>
                  ) : (
                    <div className="leading-tight">{r.num}</div>
                  )}
                  <div className="text-[11px] text-gray-400 leading-none">
                    {r.mes}
                  </div>
                </th>
              );
            })}
            {titulosValores?.map((t, i) => (
              <th
                key={`${t}-${String(i)}`}
                className="px-2 py-2 text-right font-medium text-gray-500"
              >
                {t}
              </th>
            ))}
            {titulosValores && <th />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas.map((f, i) => (
            <Fragment key={f.id}>
              {f.grupo && filas[i - 1]?.grupo !== f.grupo && (
                <tr
                  className={`bg-gray-50/70 ${
                    f.grupoDestacado ? "border-t-4 border-gray-300" : ""
                  }`}
                >
                  <td
                    colSpan={1 + dias.length + (titulosValores ? 4 : 0)}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{f.grupo}</span>
                      {f.grupoAccion}
                    </div>
                  </td>
                </tr>
              )}
            <tr>
              <td className={`px-3 py-2 text-gray-900 ${f.grupo ? "pl-6" : ""}`}>
                {f.titulo}
              </td>
              {dias.map((d) => {
                if (f.renderCelda)
                  return (
                    <td key={d} className="px-1 py-1 text-center">
                      {f.renderCelda(d)}
                    </td>
                  );
                const cant = f.cantidadEn(d);
                return (
                  <td key={d} className="px-2 py-1.5">
                    {/* La MISMA pieza que usa Servicios (QuantitySelector),
                        para que el sistema se vea homogéneo — pedido de
                        Felipe, 15-08. De paso el número se puede teclear. */}
                    <div className="flex justify-center">
                      <QuantitySelector
                        value={cant}
                        onChange={(nueva) => f.onCambiar(d, nueva)}
                        disabled={congelado}
                        max={f.masDeshabilitado ? cant : undefined}
                      />
                    </div>
                  </td>
                );
              })}
              {f.valores?.map((v, vi) => (
                <td
                  key={`v-${String(vi)}`}
                  className="px-2 py-1.5 text-right tabular-nums text-gray-700"
                >
                  {v}
                </td>
              ))}
              {titulosValores && (
                <td className="px-1 py-1 text-center">{f.accion}</td>
              )}
            </tr>
            </Fragment>
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
              {pie.valores.map((v, pi) => (
                <td
                  key={`p-${String(pi)}`}
                  className="px-2 py-2 text-right tabular-nums font-bold text-gray-900"
                >
                  {v}
                </td>
              ))}
              {titulosValores && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
