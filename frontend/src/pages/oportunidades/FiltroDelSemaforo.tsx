import type { ReactNode } from "react";
import type { Semaforo } from "../../services/oportunidades.service";
import { SEMAFOROS } from "./oportunidades.utils";

// EL SEMÁFORO Y EL BUSCADOR, UNA SOLA PIEZA (20-10). Nació en los filtros de
// la bandeja (18-10) y se sacó aparte cuando Felipe pidió lo mismo en «Se
// viene» (decisión 62): "sería bueno que este filtro sea el mismo que este,
// con verdes, amarillas, rojas y buscador". Cada color es un botón que se
// prende y se apaga, con cuántas hay; las rojas apagadas dicen «ocultas».
// Va sin envoltorio: cada pantalla lo pone en su fila. `antesDelBuscador`
// deja meter un botón propio entre los colores y el buscador (en «Se
// viene», la prioridad).

export default function FiltroDelSemaforo({
  seleccion,
  onCambiar,
  porSemaforo,
  busca,
  onBuscar,
  antesDelBuscador,
}: {
  readonly seleccion: ReadonlyArray<Semaforo>;
  readonly onCambiar: (semaforos: Semaforo[]) => void;
  readonly porSemaforo: Readonly<Record<Semaforo, number>>;
  readonly busca: string;
  readonly onBuscar: (busca: string) => void;
  readonly antesDelBuscador?: ReactNode;
}) {
  const alternar = (s: Semaforo) =>
    onCambiar(
      seleccion.includes(s)
        ? seleccion.filter((x) => x !== s)
        : [...seleccion, s],
    );
  return (
    <>
      {(Object.keys(SEMAFOROS) as Semaforo[]).map((s) => {
        const activo = seleccion.includes(s);
        return (
          <button
            key={s}
            type="button"
            onClick={() => alternar(s)}
            aria-pressed={activo}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border ${
              activo
                ? SEMAFOROS[s].chip
                : "border-gray-200 bg-white text-gray-400"
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${SEMAFOROS[s].punto}`}
            />
            {SEMAFOROS[s].label} {porSemaforo[s]}
            {!activo && s === "rojo" && " · ocultas"}
          </button>
        );
      })}

      {antesDelBuscador}

      <input
        type="text"
        value={busca}
        onChange={(e) => onBuscar(e.target.value)}
        placeholder="Buscar nombre, organismo o código"
        className="flex-1 min-w-[12rem] px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </>
  );
}
