import HoraInput, {
  formatoHoras,
  horasTrabajadas,
} from "../inputs/HoraInput";
import SelectorColacion from "../inputs/SelectorColacion";
import NumberInput from "../inputs/NumberInput";
import type { Asignacion } from "../../types/people.types";

/**
 * LA TABLA DE JORNADAS — pieza de la casa (Felipe, 18-08).
 *
 * "Siento mucho desorden: muchas cajas, chips, formas, todas de distinto
 * tamaño y ubicación." Antes cada fila era una hilera de cosas sueltas
 * y las dos pantallas (día de restaurante y evento) las armaban cada
 * una a su manera. Ahora es UNA tabla, la misma en las dos:
 *
 *   [Quiénes…] · Cargo · Entrada · Salida · Colación · Horas · Monto · Propina
 *
 * Las reglas que la ordenan:
 *  - Títulos arriba, en gris pequeño: mandan los datos, no los rótulos.
 *  - Todas las filas del mismo alto; una sola forma por celda.
 *  - BORDE = SE EDITA. Lo que solo se lee (horas, propina repartida) va
 *    como texto plano, sin caja.
 *  - Nada azul: el color queda para lo que importa — ámbar = falta un
 *    monto, rojo = fuera del reparto.
 *  - El chip "sin propina" se conserva: está en varias partes y ya se
 *    conoce. Vive en la MISMA columna que la propina repartida, así
 *    no queda un hueco entre el monto y el chip antes de repartir.
 *  - El primer título es el de la sección ("Quiénes trabajaron"): no
 *    hace falta un rótulo arriba y otro "Persona" abajo.
 *  - SIN PAPELERA (Felipe, 18-08): "sin dejar asignación y sin propina
 *    es suficiente". Quien no vino se saca desde Planificación.
 *
 * El monto es UNA columna para dos cosas: la jornada del freelance (no
 * puede faltar → ámbar) y la asignación extra de la planta (optativa).
 * El título lo dice según lo que haya en la tabla, y la caja vacía lo
 * repite en gris para que nunca haya duda de qué es.
 */

export type CambiosDeJornada = Partial<
  Pick<
    Asignacion,
    "starts_at" | "ends_at" | "break_minutes" | "amount" | "no_tip"
  >
>;

export interface SeccionDeJornadas {
  /** Título de la sección (el día, en un evento de varios). */
  readonly titulo?: string;
  readonly filas: readonly Asignacion[];
}

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");

const nombreDe = (a: Asignacion) => a.people?.name ?? "—";

/** Con solo planta dice "Asignación extra"; con solo freelance,
 *  "Jornada"; mezcladas, "Monto" y la caja aclara cuál es cuál. */
export const tituloDelMonto = (filas: readonly Asignacion[]): string => {
  const hayPlanta = filas.some((a) => a.kind === "planta");
  const hayFreelance = filas.some((a) => a.kind !== "planta");
  // Corto, para que el título quepa en una línea (Felipe, 18-08).
  if (hayPlanta && !hayFreelance) return "Asig. extra";
  if (hayFreelance && !hayPlanta) return "Jornada";
  return "Monto";
};

// ANCHOS FIJOS, no "lo que mida el contenido": el encabezado y cada fila
// son grillas distintas, y si cada una midiera lo suyo los títulos
// quedarían corridos de sus columnas (pasó en la primera versión). Con
// anchos fijos, todas miden igual y calzan. Persona toma lo que sobra;
// un cargo largo se corta con puntos y se lee entero al pasar el mouse.
const COLS =
  "grid grid-cols-[minmax(6rem,1fr)_6rem_8rem_8rem_5rem_2.75rem_7.5rem_9rem] items-center gap-x-2";

export default function TablaDeJornadas({
  secciones,
  titulo = "Persona",
  cerrada = false,
  onCambiar,
}: {
  readonly secciones: readonly SeccionDeJornadas[];
  /** El título de la primera columna: "Quiénes trabajaron", "Quiénes vinieron"… */
  readonly titulo?: string;
  /** Ficha cerrada: solo se lee. */
  readonly cerrada?: boolean;
  readonly onCambiar: (id: number, cambios: CambiosDeJornada) => void;
}) {
  const todas = secciones.flatMap((s) => s.filas);
  const th = "text-[11px] font-semibold uppercase tracking-wide text-gray-500";

  return (
    <div className="text-sm">
      {/* Los títulos, una sola vez. */}
      <div className={`${COLS} pb-1.5 border-b border-gray-200`}>
        <span className={th}>{titulo}</span>
        <span className={th}>Cargo</span>
        <span className={th}>Entrada</span>
        <span className={th}>Salida</span>
        <span className={th}>Colación</span>
        <span className={`${th} text-right`}>Horas</span>
        <span className={`${th} text-right`}>{tituloDelMonto(todas)}</span>
        <span className={`${th} text-right pr-1`}>Propina</span>
      </div>

      {secciones.map((s, i) => (
        <div key={s.titulo ?? i}>
          {s.titulo && (
            <div className="pt-3 pb-1 text-[11px] font-semibold uppercase text-gray-500">
              {s.titulo}
            </div>
          )}
          <ul>
            {s.filas.map((a) => (
                <li key={a.id} className={`${COLS} h-10 border-b border-gray-100`}>
                  <span className="truncate text-gray-900" title={nombreDe(a)}>
                    {nombreDe(a)}
                  </span>
                  <span
                    className="text-gray-500 truncate"
                    title={a.management_resources?.name ?? "sin cargo"}
                  >
                    {a.management_resources?.name ?? "sin cargo"}
                  </span>

                  {cerrada ? (
                    <>
                      <span className="tabular-nums text-gray-700">
                        {a.starts_at?.slice(0, 5) ?? "—"}
                      </span>
                      <span className="tabular-nums text-gray-700">
                        {a.ends_at?.slice(0, 5) ?? "—"}
                      </span>
                      <span className="text-gray-700">
                        {!a.break_minutes
                          ? "—"
                          : a.break_minutes === 60
                            ? "1 h"
                            : `${String(a.break_minutes)} m`}
                      </span>
                    </>
                  ) : (
                    <>
                      <HoraInput
                        value={a.starts_at?.slice(0, 5) ?? null}
                        onChange={(v) => onCambiar(a.id, { starts_at: v })}
                        compacta
                        aria-label={`Entrada de ${nombreDe(a)}`}
                      />
                      <HoraInput
                        value={a.ends_at?.slice(0, 5) ?? null}
                        onChange={(v) => onCambiar(a.id, { ends_at: v })}
                        compacta
                        aria-label={`Salida de ${nombreDe(a)}`}
                      />
                      <SelectorColacion
                        value={a.break_minutes}
                        onChange={(min) => onCambiar(a.id, { break_minutes: min })}
                      />
                    </>
                  )}

                  <span className="text-right tabular-nums text-gray-700">
                    {formatoHoras(
                      horasTrabajadas(
                        a.starts_at?.slice(0, 5) ?? null,
                        a.ends_at?.slice(0, 5) ?? null,
                        a.break_minutes,
                      ),
                    )}
                  </span>

                  {cerrada ? (
                    <span className="text-right tabular-nums text-gray-700">
                      {a.amount ? clp(Number(a.amount)) : "—"}
                    </span>
                  ) : (
                    <div
                      className="relative"
                      title={
                        a.kind === "planta"
                          ? "Asignación extra (optativa)"
                          : "Monto de la jornada"
                      }
                    >
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                        $
                      </span>
                      {/* VACÍA, SOLO EL "$": el título de la columna ya
                          dice qué es; repetirlo en cada caja era ruido
                          (Felipe, 18-08). Y del MISMO alto, borde y
                          radio que los relojes: NumberInput trae px-3
                          py-2 rounded-lg y hay que pisarlos todos. En un
                          freelance queda ámbar hasta que tiene jornada. */}
                      <NumberInput
                        value={a.amount ? Number(a.amount) : undefined}
                        onCommit={(v: number | undefined) =>
                          onCambiar(a.id, { amount: v ?? null })
                        }
                        placeholder=""
                        aria-label={
                          a.kind === "planta"
                            ? `Asignación extra de ${nombreDe(a)}`
                            : `Monto de ${nombreDe(a)}`
                        }
                        className={`!pl-5 !pr-1.5 !py-1 !rounded text-xs text-right ${
                          !a.amount && a.kind !== "planta"
                            ? "!border-amber-400 bg-amber-50"
                            : "!border-gray-200"
                        }`}
                      />
                    </div>
                  )}

                  {/* Propina repartida y el chip, juntos y a la derecha. */}
                  <span className="flex items-center justify-end gap-2">
                    <span className="tabular-nums text-emerald-700">
                      {Number(a.tip_amount ?? 0) > 0 ? clp(Number(a.tip_amount)) : ""}
                    </span>
                    {cerrada ? (
                      a.no_tip && (
                        <span className="text-[11px] text-red-700 whitespace-nowrap">
                          sin propina
                        </span>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => onCambiar(a.id, { no_tip: !a.no_tip })}
                        title={
                          a.no_tip
                            ? "No lleva propina este día"
                            : "Marcar: no lleva propina este día"
                        }
                        className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${
                          a.no_tip
                            ? "bg-red-50 text-red-700 border-red-300 font-medium"
                            : "text-gray-400 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        sin propina
                      </button>
                    )}
                  </span>
                </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
