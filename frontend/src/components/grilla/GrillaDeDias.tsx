import { Fragment, type ReactNode } from "react";
import { X } from "lucide-react";
import QuantitySelector from "../QuantitySelector";
import { COLOR_SECCION, type ColorDeSeccion } from "./coloresDeSeccion";

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

/** v2.2 (09-11-2026): una SECCIÓN agrupa varias bandas bajo un título
 *  con su color y una línea de color a la izquierda — en la sábana:
 *  Eventos, Personal de planta y Personal Staff (Felipe: "agreguemos
 *  separaciones visuales entre eventos / planta / Staff"). Gestión no la
 *  usa y se ve igual que siempre. */
export interface SeccionGrillaDias {
  readonly titulo: string;
  readonly color: ColorDeSeccion;
  /** Un control a la derecha del título (ej: "+ cargo"). */
  readonly accion?: ReactNode;
}

/** v2.3 (09-11-2026): la banda de un grupo pintada con SU color — una línea
 *  a la izquierda que baja por todas sus filas, su número con el detalle en
 *  la misma línea, un fondo suave y una barra sobre sus días. En la sábana,
 *  cada evento ("irlo viendo en cascada", Felipe). Sin esto, la banda gris
 *  de siempre. */
export interface BarraDeGrupo {
  /** Lo corto, en negrita (ej: "#522"). */
  readonly numero: string;
  /** Lo que sigue en la misma línea (ej: "FDN Canotaje · mié 4 al dom 8 nov"). */
  readonly detalle: string;
  /** Los días que cubre la barra. */
  readonly dias: ReadonlySet<string>;
  readonly color: {
    /** La barra de sus días y la línea de la izquierda. */
    readonly barra: string;
    readonly texto: string;
    /** El fondo suave de la fila del título. */
    readonly fondo: string;
  };
}

/** El número de hoy en la cabecera: un círculo azul, como en un calendario. */
const CIRCULO_DE_HOY =
  "inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white leading-none";

/** La línea de color a la izquierda de las filas de un grupo. Va como una
 *  franja DENTRO de la celda y no como borde: el borde de una celda se corre
 *  2 px respecto de la línea de su sección (en una tabla los bordes se
 *  reparten mitad afuera), y Felipe pidió verlas alineadas (09-11-2026).
 *  El -top-px tapa la rayita divisoria entre filas: se ve continua. */
function LineaDeGrupo({ color }: { readonly color: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute -top-px bottom-0 left-0 w-1 ${color}`}
    />
  );
}

export interface FilaGrillaDias {
  readonly id: number | string;
  /** v2.2: la sección de la fila. Filas contiguas con el mismo título
   *  comparten UN encabezado de sección. */
  readonly seccion?: SeccionGrillaDias;
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
  /** v2.3: la banda con su color y la barra de sus días. */
  readonly grupoBarra?: BarraDeGrupo;
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
  anchoTitulo = "w-56",
  calendario = false,
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
  /** v2.0: el día a resaltar (normalmente hoy): su número va en un círculo
   *  azul, como en un calendario. Solo arriba, en la fecha (Felipe,
   *  09-11-2026: "no sé si vale mucho marcar el día actual para abajo,
   *  quizás solo arriba en la fecha"). Solo la sábana lo pasa. */
  readonly resaltarDia?: string;
  /** v2.1: pinchar el encabezado de un día (la sábana abre su resumen). */
  readonly onDiaClick?: (dia: string) => void;
  /** v2.4 (09-11-2026): el ancho de la columna de títulos. Gestión deja
   *  el de siempre (w-56) para que sus dos grillas calcen; la sábana la
   *  ensancha para que cada evento quepa en una línea. */
  readonly anchoTitulo?: string;
  /** v2.5 (09-11-2026): la grilla como calendario — sobre blanco y con el
   *  mes solo cuando cambia. La usa la sábana de Planificación; Gestión
   *  queda como siempre. (Tuvo una línea antes de cada domingo para separar
   *  las semanas; Felipe la sacó ese mismo día: "¿por qué hay una raya del
   *  sáb 14 al dom 15?".) */
  readonly calendario?: boolean;
}) {
  // El mes, solo el primer día y cuando cambia.
  const conMes = (d: string, i: number) =>
    !calendario || i === 0 || d.slice(8, 10) === "01";
  return (
    <div
      className={`border border-gray-200 rounded-xl overflow-x-auto ${
        calendario ? "bg-white" : ""
      }`}
    >
      <table className="w-full text-sm table-fixed min-w-[56rem]">
        <colgroup>
          <col className={anchoTitulo} />
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
          <tr
            className={`border-b border-gray-200 ${calendario ? "" : "bg-gray-50"}`}
          >
            <th className="px-3 py-2 text-left font-medium text-gray-500">
              {columnaTitulo}
            </th>
            {dias.map((d, di) => {
              const r = rotuloDia(d);
              const quitable = !diasFijos.has(d) && !congelado;
              const esHoy = d === resaltarDia;
              // Con un día resaltado, todos los números ocupan el alto del
              // círculo: así las tres líneas calzan entre columnas.
              const numero = resaltarDia
                ? "inline-flex h-6 items-center justify-center leading-none"
                : "leading-tight";
              return (
                <th
                  key={d}
                  className="px-2 py-2 text-center font-medium text-gray-600"
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
                      className={
                        esHoy
                          ? `${CIRCULO_DE_HOY} hover:bg-blue-700`
                          : `${numero} hover:text-blue-700 hover:underline`
                      }
                    >
                      {r.num}
                    </button>
                  ) : (
                    <div className={esHoy ? `mx-auto ${CIRCULO_DE_HOY}` : "leading-tight"}>
                      {r.num}
                    </div>
                  )}
                  <div className="text-[11px] text-gray-400 leading-none">
                    {conMes(d, di) ? r.mes : "\u00a0"}
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
              {f.seccion &&
                filas[i - 1]?.seccion?.titulo !== f.seccion.titulo && (
                  <tr>
                    <td
                      colSpan={1 + dias.length + (titulosValores ? 4 : 0)}
                      // Sin margen a los lados: la línea de la sección calza
                      // con la de cada evento (Felipe, 09-11-2026).
                      className={`px-0 ${i === 0 ? "pt-2" : "pt-6"} pb-1`}
                    >
                      <div
                        className={`flex items-center justify-between gap-2 border-l-4 rounded-none px-3 py-1.5 ${
                          COLOR_SECCION[f.seccion.color]
                        }`}
                      >
                        <span className="text-sm font-semibold">
                          {f.seccion.titulo}
                        </span>
                        {f.seccion.accion}
                      </div>
                    </td>
                  </tr>
                )}
              {f.grupo && filas[i - 1]?.grupo !== f.grupo && f.grupoBarra && (
                <>
                  <tr>
                    <td
                      className={`relative px-3 py-1.5 text-sm ${f.grupoBarra.color.fondo} ${f.grupoBarra.color.texto}`}
                    >
                      <LineaDeGrupo color={f.grupoBarra.color.barra} />
                      {/* Todo en una línea (Felipe, 09-11-2026: "el número
                          del evento y el nombre de cliente y fecha, ¿no
                          será mejor que esté todo en la misma fila?"). */}
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words">
                          <span className="font-semibold">{f.grupoBarra.numero}</span>
                          {f.grupoBarra.detalle ? ` · ${f.grupoBarra.detalle}` : ""}
                        </span>
                        {f.grupoAccion && <span className="shrink-0">{f.grupoAccion}</span>}
                      </div>
                    </td>
                    {dias.map((d, di) => {
                      const barra = f.grupoBarra!;
                      const dentro = barra.dias.has(d);
                      const parte = dentro && !barra.dias.has(dias[di - 1] ?? "");
                      const termina = dentro && !barra.dias.has(dias[di + 1] ?? "");
                      return (
                        <td
                          key={d}
                          className={`px-0 py-1.5 align-middle ${barra.color.fondo}`}
                        >
                          {dentro && (
                            <span
                              className={`block h-2 ${barra.color.barra} ${
                                parte ? "rounded-l-full ml-1" : ""
                              } ${termina ? "rounded-r-full mr-1" : ""}`}
                            />
                          )}
                        </td>
                      );
                    })}
                    {titulosValores && (
                      <td colSpan={4} className={f.grupoBarra.color.fondo} />
                    )}
                  </tr>
                </>
              )}
              {f.grupo && filas[i - 1]?.grupo !== f.grupo && !f.grupoBarra && (
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
              <td
                className={`px-3 py-2 text-gray-900 ${f.grupo || f.seccion ? "pl-6" : ""} ${
                  f.grupoBarra ? "relative" : ""
                }`}
              >
                {/* La línea del color del evento baja por todas sus filas
                    (Felipe, 09-11-2026), no solo por la banda. */}
                {f.grupoBarra && <LineaDeGrupo color={f.grupoBarra.color.barra} />}
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
