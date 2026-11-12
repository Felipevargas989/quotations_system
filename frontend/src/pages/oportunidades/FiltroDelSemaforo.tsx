import { type ColorDeLaLista, SEMAFOROS } from "./oportunidades.utils";

// EL SEMÁFORO Y EL BUSCADOR, UNA SOLA PIEZA (20-10). Nació en los filtros de
// la bandeja (18-10) y se sacó aparte cuando Felipe pidió lo mismo en «Se
// viene» (decisión 62): "sería bueno que este filtro sea el mismo que este,
// con verdes, amarillas, rojas y buscador". Cada color es un botón que se
// prende y se apaga, con cuántas hay. Desde la decisión 72 (23-10) el rojo
// es el «Reciclaje» y se porta igual que el verde y el amarillo (prendido de
// partida); la basura no tiene botón: solo aparece al buscar (Felipe, 23-10:
// "gris lo eliminaría; rojo que sea igual en comportamiento al verde y
// amarillo"). Va sin envoltorio: cada pantalla lo pone en su fila.

const COLORES_DEL_FILTRO: ReadonlyArray<ColorDeLaLista> = [
  "verde",
  "amarillo",
  "rojo",
];

export default function FiltroDelSemaforo({
  seleccion,
  onCambiar,
  porSemaforo,
  busca,
  onBuscar,
}: {
  readonly seleccion: ReadonlyArray<ColorDeLaLista>;
  readonly onCambiar: (semaforos: ColorDeLaLista[]) => void;
  readonly porSemaforo: Readonly<Record<ColorDeLaLista, number>>;
  readonly busca: string;
  readonly onBuscar: (busca: string) => void;
}) {
  const alternar = (s: ColorDeLaLista) =>
    onCambiar(
      seleccion.includes(s)
        ? seleccion.filter((x) => x !== s)
        : [...seleccion, s],
    );
  return (
    <>
      {COLORES_DEL_FILTRO.map((s) => {
        const activo = seleccion.includes(s);
        return (
          <button
            key={s}
            type="button"
            onClick={() => alternar(s)}
            aria-pressed={activo}
            title={SEMAFOROS[s].ayuda}
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
          </button>
        );
      })}

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
