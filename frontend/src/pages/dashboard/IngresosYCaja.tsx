import { DollarSign } from "lucide-react";
import { MONTHS } from "../../constants/dates";
import { formatCurrency } from "../../utils/currencies";
import Tooltip from "../../components/Tooltip";

/**
 * INGRESOS Y CAJA POR MES — partido en dos mitades (Felipe, 29-08-2026).
 *
 * Antes era una sola tabla que mezclaba dos historias distintas. Él lo
 * dijo así: "este gráfico mezcla flujo de caja y EERR (puede ser el
 * mismo pero partido)".
 *
 *   ARRIBA · RESULTADO — cómo anduvo el negocio: eventos, ventas, lo que
 *   costaron y qué quedó. Va por fecha del EVENTO (devengado).
 *
 *   ABAJO · CAJA — la plata de verdad: lo que entró, lo que salió y lo
 *   que falta por entrar. Va por fecha del MOVIMIENTO.
 *
 * El costo y el pago van separados en PROVEEDORES y PERSONAL, también a
 * pedido suyo, "para poder validar tus cálculos". Proveedores es todo lo
 * que le paga a terceros (insumos + arriendos); personal es su equipo.
 *
 * Este archivo nació de una higuera: el panel vivía dentro de
 * DashboardPage, que está congelado por el portero y no tenía espacio
 * para las cuatro filas nuevas.
 */

export interface MesDeCaja {
  month: string;
  monthKey: string;
  eventos: number;
  ventas: number;
  cobrado: number;
  porCobrar: number;
}

export interface CostoDelMes {
  proveedores: number;
  personal: number;
  /** true = todavía no está cerrado (insumos de receta o sin recursos). */
  estimado: boolean;
}

export interface PagadoDelMes {
  proveedores: number;
  personal: number;
}

/** Una línea del desglose: quién y cuánto. */
export interface LineaDeDesglose {
  cliente: string;
  cot: number;
  monto: number;
}

/** De qué se compone cada cifra del mes (Felipe, 31-08): al pasar el
 *  mouse, los clientes con su monto — "dice más que el cod de
 *  cotización". Se junta en DashboardPage, en el mismo recorrido que
 *  suma los totales, así el desglose SIEMPRE suma la celda. */
export interface DesgloseDeMes {
  ventas: LineaDeDesglose[];
  proveedores: LineaDeDesglose[];
  personal: LineaDeDesglose[];
  pagadoProv: LineaDeDesglose[];
}

interface Celda {
  text: string;
  title?: string;
  cls?: string;
}

interface Fila {
  label: string;
  /** Sangría: las que suman dentro de un bloque van corridas. */
  hija?: boolean;
  cell: (r: MesDeCaja) => Celda;
  total: () => Celda;
  /** Las líneas que componen la cifra del mes: el globo al pasar el
   *  mouse. Sin líneas no hay globo, queda el title de siempre. */
  desglose?: (r: MesDeCaja) => LineaDeDesglose[];
}

interface Props {
  meses: MesDeCaja[];
  recortada: boolean;
  costoPorMes: Map<string, CostoDelMes>;
  pagadoPorMes: Map<string, PagadoDelMes>;
  desglosePorMes: Map<string, DesgloseDeMes>;
  currency: string;
}

const esMesFuturo = (monthKey: string): boolean => {
  const [year, monthIndex] = monthKey.split("-").map(Number);
  const ahora = new Date();
  if (year > ahora.getFullYear()) return true;
  return year === ahora.getFullYear() && monthIndex > ahora.getMonth();
};

// Cifras EN MILES (pedido de Felipe, 23-07): 1.000.000 se lee 1.000.
// El monto exacto sigue en el tooltip.
const miles = (n: number) => Math.round(n / 1000).toLocaleString("es-CL");

const mesCorto = (monthKey: string) => {
  const [year, monthIndex] = monthKey.split("-");
  return `${MONTHS[parseInt(monthIndex)].slice(0, 3)} ${year.slice(2)}`;
};

export default function IngresosYCaja({
  meses,
  recortada,
  costoPorMes,
  pagadoPorMes,
  desglosePorMes,
  currency,
}: Props) {
  const plata = (n: number) => formatCurrency(n, currency);
  const sumar = (f: (r: MesDeCaja) => number) =>
    meses.reduce((suma, r) => suma + f(r), 0);

  const costo = (r: MesDeCaja) =>
    costoPorMes.get(r.monthKey) ?? {
      proveedores: 0,
      personal: 0,
      estimado: false,
    };
  const pagado = (r: MesDeCaja) =>
    pagadoPorMes.get(r.monthKey) ?? { proveedores: 0, personal: 0 };
  const costoTotalDe = (r: MesDeCaja) => {
    const c = costo(r);
    return c.proveedores + c.personal;
  };
  /** Una fila de plata simple: cifra en miles, monto exacto al pasar. */
  const filaDePlata = (
    label: string,
    valor: (r: MesDeCaja) => number,
    opciones: { hija?: boolean; cls?: string; clsTotal?: string } = {},
  ): Fila => ({
    label,
    hija: opciones.hija,
    cell: (r) => {
      const v = valor(r);
      return {
        text: v ? miles(v) : "—",
        title: v ? plata(v) : undefined,
        cls: opciones.cls,
      };
    },
    total: () => {
      const t = sumar(valor);
      return {
        text: t ? miles(t) : "—",
        title: t ? plata(t) : undefined,
        cls: opciones.clsTotal ?? "font-bold",
      };
    },
  });

  // El desglose del mes para una fuente dada; vacío = sin globo.
  const lineasDe =
    (fuente: keyof DesgloseDeMes) =>
    (r: MesDeCaja): LineaDeDesglose[] =>
      desglosePorMes.get(r.monthKey)?.[fuente] ?? [];

  // ---------------- ARRIBA: cómo anduvo el negocio ----------------
  const filasResultado: Fila[] = [
    {
      label: "Eventos",
      cell: (r) => ({ text: r.eventos ? String(r.eventos) : "—" }),
      total: () => ({ text: String(sumar((r) => r.eventos)) }),
    },
    {
      ...filaDePlata("Ventas", (r) => r.ventas, { cls: "font-semibold" }),
      desglose: lineasDe("ventas"),
    },
    // Sin el "~" de estimación: a Felipe no le decía nada (31-08).
    {
      ...filaDePlata("Costo proveedores", (r) => costo(r).proveedores, {
        hija: true,
      }),
      desglose: lineasDe("proveedores"),
    },
    {
      ...filaDePlata("Costo personal", (r) => costo(r).personal, {
        hija: true,
      }),
      desglose: lineasDe("personal"),
    },
    {
      label: "Margen",
      cell: (r) => {
        if (!r.ventas) return { text: "—" };
        const v = r.ventas - costoTotalDe(r);
        return {
          text: miles(v),
          title: plata(v),
          cls:
            v >= 0
              ? "text-emerald-700 font-semibold"
              : "text-red-600 font-semibold",
        };
      },
      total: () => {
        const v = sumar((r) => r.ventas);
        const c = sumar(costoTotalDe);
        return {
          text: v ? miles(v - c) : "—",
          title: plata(v - c),
          cls:
            v - c >= 0
              ? "text-emerald-700 font-bold"
              : "text-red-600 font-bold",
        };
      },
    },
    {
      label: "Margen %",
      cell: (r) => {
        if (!r.ventas) return { text: "—" };
        const v = r.ventas - costoTotalDe(r);
        return {
          text: `${((v * 100) / r.ventas).toLocaleString("es-CL", {
            maximumFractionDigits: 0,
          })}%`,
          cls: v >= 0 ? "text-emerald-700" : "text-red-600 font-semibold",
        };
      },
      total: () => {
        const v = sumar((r) => r.ventas);
        const c = sumar(costoTotalDe);
        return {
          text: v
            ? `${(((v - c) * 100) / v).toLocaleString("es-CL", {
                maximumFractionDigits: 0,
              })}%`
            : "—",
          cls:
            v - c >= 0
              ? "text-emerald-700 font-bold"
              : "text-red-600 font-bold",
        };
      },
    },
  ];

  // ---------------- ABAJO: la plata de verdad ----------------
  // Flujo = lo que entró − lo que salió + lo que falta por entrar.
  // Es la fórmula que pidió Felipe: no es caja pura (mezcla lo cobrado
  // con lo que aún deben), es la POSICIÓN del mes.
  const flujoDe = (r: MesDeCaja) => {
    const p = pagado(r);
    return r.cobrado - p.proveedores - p.personal + r.porCobrar;
  };

  const filasCaja: Fila[] = [
    filaDePlata("Cobrado", (r) => r.cobrado, {
      cls: "text-green-700",
      clsTotal: "text-green-700 font-bold",
    }),
    {
      ...filaDePlata("Pagado proveedores", (r) => pagado(r).proveedores, {
        hija: true,
      }),
      desglose: lineasDe("pagadoProv"),
    },
    filaDePlata("Pagado personal", (r) => pagado(r).personal, {
      hija: true,
    }),
    {
      ...filaDePlata("Por cobrar", (r) => r.porCobrar, {
      }),
      cell: (r) => ({
        text: r.porCobrar ? miles(r.porCobrar) : "—",
        title: r.porCobrar ? plata(r.porCobrar) : undefined,
        cls:
          r.porCobrar && !esMesFuturo(r.monthKey)
            ? "text-red-600 font-semibold"
            : "",
      }),
      total: () => {
        const t = sumar((r) => r.porCobrar);
        return {
          text: t ? miles(t) : "—",
          title: t ? plata(t) : undefined,
          cls: "text-red-700 font-bold",
        };
      },
    },
    {
      label: "Flujo de caja",
      cell: (r) => {
        const v = flujoDe(r);
        if (!v) return { text: "—" };
        return {
          text: miles(v),
          title: plata(v),
          cls: v >= 0 ? "text-emerald-700 font-bold" : "text-red-600 font-bold",
        };
      },
      total: () => {
        const t = sumar(flujoDe);
        return {
          text: t ? miles(t) : "—",
          title: t ? plata(t) : undefined,
          cls: t >= 0 ? "text-emerald-700 font-bold" : "text-red-600 font-bold",
        };
      },
    },
  ];

  const bloques: { titulo: string; subtitulo: string; filas: Fila[] }[] = [
    {
      titulo: "Resultado",
      subtitulo: "por fecha del evento",
      filas: filasResultado,
    },
    { titulo: "Caja", subtitulo: "por fecha del movimiento", filas: filasCaja },
  ];

  const celda = (fila: Fila, r: MesDeCaja) => {
    const c = fila.cell(r);
    // El globo con la composición (Felipe, 31-08): cliente por cliente,
    // ordenado del monto más grande al más chico. La suma ES la celda,
    // porque el desglose se junta en el mismo recorrido que los totales.
    const lineas = (fila.desglose?.(r) ?? [])
      .filter((l) => l.monto)
      .sort((a, b) => b.monto - a.monto);
    if (c.text === "—" || lineas.length === 0) {
      return (
        <td
          key={r.monthKey}
          title={c.title}
          className={`py-1.5 px-2 text-right tabular-nums whitespace-nowrap ${
            esMesFuturo(r.monthKey) ? "text-gray-400" : c.cls || ""
          }`}
        >
          {c.text}
        </td>
      );
    }
    const titulo = lineas
      .map((l) => `${l.cliente} (#${l.cot}): ${plata(l.monto)}`)
      .join(" · ");
    return (
      <td
        key={r.monthKey}
        className={`py-1.5 px-2 text-right tabular-nums whitespace-nowrap ${
          esMesFuturo(r.monthKey) ? "text-gray-400" : c.cls || ""
        }`}
      >
        <Tooltip
          lado="izquierda"
          titulo={titulo}
          contenido={
            <span className="block space-y-0.5">
              {lineas.map((l) => (
                <span
                  key={`${l.cot}-${l.cliente}`}
                  className="flex justify-between gap-3 whitespace-nowrap"
                >
                  <span className="text-gray-300">
                    {l.cliente}{" "}
                    <span className="text-gray-500">#{l.cot}</span>
                  </span>
                  <span className="tabular-nums">{plata(l.monto)}</span>
                </span>
              ))}
              {lineas.length > 1 && (
                <span className="flex justify-between gap-3 border-t border-gray-700 pt-0.5 font-semibold whitespace-nowrap">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {plata(lineas.reduce((t, l) => t + l.monto, 0))}
                  </span>
                </span>
              )}
            </span>
          }
        >
          <span className="cursor-help">{c.text}</span>
        </Tooltip>
      </td>
    );
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex items-center space-x-2 mb-4">
        <DollarSign className="h-5 w-5 text-green-600" />
        <h2 className="text-lg font-semibold text-gray-900">
          Ingresos y Caja por Mes
        </h2>
        <span className="text-sm text-gray-500">
          (en miles de pesos
          {recortada ? " · últimos 12 meses del período" : ""})
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-2 text-left font-medium sticky left-0 bg-white">
                Concepto
              </th>
              {meses.map((r) => (
                <th
                  key={r.monthKey}
                  className={`py-2 px-2 text-right font-medium whitespace-nowrap ${
                    esMesFuturo(r.monthKey) ? "text-gray-300" : ""
                  }`}
                  title={r.month}
                >
                  {mesCorto(r.monthKey)}
                  {esMesFuturo(r.monthKey) ? " ·f" : ""}
                </th>
              ))}
              <th className="py-2 pl-2 text-right font-bold text-gray-700 border-l border-gray-200">
                TOTAL
              </th>
            </tr>
          </thead>
          {bloques.map((bloque) => (
            <tbody
              key={bloque.titulo}
              className="divide-y divide-gray-100 border-t-2 border-gray-200"
            >
              <tr className="bg-gray-50">
                <td
                  className="py-1.5 pr-2 text-[10px] uppercase tracking-wider font-bold text-gray-500 sticky left-0 bg-gray-50 whitespace-nowrap"
                  colSpan={meses.length + 2}
                >
                  {bloque.titulo}{" "}
                  <span className="font-normal normal-case tracking-normal text-gray-400">
                    · {bloque.subtitulo}
                  </span>
                </td>
              </tr>
              {bloque.filas.map((fila) => (
                <tr key={fila.label} className="hover:bg-gray-50">
                  <td
                    className={`py-1.5 pr-2 sticky left-0 bg-white whitespace-nowrap ${
                      fila.hija
                        ? "pl-3 font-normal text-gray-600"
                        : "font-semibold text-gray-700"
                    }`}
                  >
                    {fila.label}
                  </td>
                  {meses.map((r) => celda(fila, r))}
                  {(() => {
                    const t = fila.total();
                    return (
                      <td
                        title={t.title}
                        className={`py-1.5 pl-2 text-right tabular-nums whitespace-nowrap border-l border-gray-200 bg-gray-50 ${
                          t.cls || ""
                        }`}
                      >
                        {t.text}
                      </td>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
        {/* El pie era un ladrillo de ocho líneas que nadie leía dos veces.
            Se probó explicar cada fila al pasar el mouse, pero los globos
            tapaban la tabla y Felipe los mandó a sacar: "yo me entiendo".
            Quedan solo las claves de los símbolos. */}
        <p className="mt-2 text-[11px] text-gray-400">
          <b>·f</b> = mes futuro (venta agendada) · pasa el mouse por una
          cifra para ver de qué clientes se compone
        </p>
      </div>
    </div>
  );
}
