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

interface Celda {
  text: string;
  title?: string;
  cls?: string;
}

interface Fila {
  label: string;
  /** Sangría: las que suman dentro de un bloque van corridas. */
  hija?: boolean;
  /** Qué es esta fila, al pasar el mouse por su nombre. Reemplaza al
   *  ladrillo de texto que vivía al pie (Felipe, 29-08): la explicación
   *  aparece cuando se pregunta, no antes. */
  ayuda?: string;
  cell: (r: MesDeCaja) => Celda;
  total: () => Celda;
}

interface Props {
  meses: MesDeCaja[];
  recortada: boolean;
  costoPorMes: Map<string, CostoDelMes>;
  pagadoPorMes: Map<string, PagadoDelMes>;
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
  // El "~" del total: si CUALQUIER mes visible sigue abierto.
  const algoEstimado = meses.some((r) => costo(r).estimado);

  /** Una fila de plata simple: cifra en miles, monto exacto al pasar. */
  const filaDePlata = (
    label: string,
    valor: (r: MesDeCaja) => number,
    opciones: {
      hija?: boolean;
      cls?: string;
      clsTotal?: string;
      ayuda?: string;
    } = {},
  ): Fila => ({
    label,
    hija: opciones.hija,
    ayuda: opciones.ayuda,
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

  // ---------------- ARRIBA: cómo anduvo el negocio ----------------
  const filasResultado: Fila[] = [
    {
      label: "Eventos",
      ayuda: "Eventos con fecha en el mes, ya cerrados (aceptados y realizados).",
      cell: (r) => ({ text: r.eventos ? String(r.eventos) : "—" }),
      total: () => ({ text: String(sumar((r) => r.eventos)) }),
    },
    filaDePlata("Ventas", (r) => r.ventas, {
      cls: "font-semibold",
      ayuda:
        "Lo vendido, SIN propina: la propina la paga el cliente y va entera al equipo, no es venta tuya.",
    }),
    {
      ...filaDePlata("Costo proveedores", (r) => costo(r).proveedores, {
        hija: true,
        ayuda:
          "Todo lo que le pagas a terceros por el evento: insumos más arriendos. Congelado si lo provisionaste en Compras; estimado por receta si todavía no.",
      }),
      // El "~" avisa que el costo todavía no está cerrado.
      cell: (r) => {
        const c = costo(r);
        return {
          text: c.proveedores
            ? `${c.estimado ? "~" : ""}${miles(c.proveedores)}`
            : "—",
          title: c.proveedores ? plata(c.proveedores) : undefined,
        };
      },
      total: () => {
        const t = sumar((r) => costo(r).proveedores);
        return {
          text: t ? `${algoEstimado ? "~" : ""}${miles(t)}` : "—",
          title: t ? plata(t) : undefined,
          cls: "font-bold",
        };
      },
    },
    filaDePlata("Costo personal", (r) => costo(r).personal, {
      hija: true,
      ayuda:
        "Las jornadas de las sillas asignadas al evento. Sin propina: esa no sale de tu bolsillo.",
    }),
    {
      label: "Margen",
      ayuda: "Ventas menos los dos costos.",
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
      ayuda: "Cuánto de cada peso vendido te queda.",
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
      ayuda:
        "Lo que entró, en el mes del último abono. CON propina, porque es plata que se factura: por eso Ventas y Cobrado no calzan al peso.",
    }),
    filaDePlata("Pagado proveedores", (r) => pagado(r).proveedores, {
      hija: true,
      ayuda:
        "Salió el día que provisionaste el evento en Compras. Si el evento se realizó sin provisionar, se cuenta el día del evento.",
    }),
    filaDePlata("Pagado personal", (r) => pagado(r).personal, {
      hija: true,
      ayuda:
        "Salió el día que lo marcaste pagado en Nómina, con propina incluida.",
    }),
    {
      ...filaDePlata("Por cobrar", (r) => r.porCobrar, {
        ayuda:
          "Lo que falta, por fecha de vencimiento y descontando los abonos parciales. En rojo cuando ya venció.",
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
      ayuda: "Cobrado − pagado + por cobrar.",
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

  const bloques: { titulo: string; ayuda: string; filas: Fila[] }[] = [
    {
      titulo: "Resultado",
      ayuda: "por fecha del evento",
      filas: filasResultado,
    },
    { titulo: "Caja", ayuda: "por fecha del movimiento", filas: filasCaja },
  ];

  const celda = (fila: Fila, r: MesDeCaja) => {
    const c = fila.cell(r);
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
                    · {bloque.ayuda}
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
                    {fila.ayuda ? (
                      // El Tooltip de la casa (el `title` pelado no se
                      // alcanzaba a ver: solo cambiaba el cursor).
                      <Tooltip
                        contenido={fila.ayuda}
                        titulo={fila.ayuda}
                        lado="derecha"
                      >
                        <span className="cursor-help border-b border-dotted border-gray-300">
                          {fila.label}
                        </span>
                      </Tooltip>
                    ) : (
                      fila.label
                    )}
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
            Desde el 29-08 cada concepto se explica solo al pasar el mouse
            por su nombre, y aquí quedan únicamente las claves de los
            símbolos, que no tienen dónde más vivir. */}
        <p className="mt-2 text-[11px] text-gray-400">
          <b>·f</b> = mes futuro (venta agendada) · <b>~</b> = costo todavía no
          cerrado · pasa el mouse por un concepto o una cifra para ver el
          detalle
        </p>
      </div>
    </div>
  );
}
