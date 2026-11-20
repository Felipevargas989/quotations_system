import { useState } from "react";
import Modal from "../Modal";
import SectionChipSelect from "../selects/SectionChipSelect";

// «¿DESDE QUÉ DÍA PARTE?» AL CARGAR UN PAQUETE (Felipe, 20-11-2026).
//
// Dos programas seguidos en la misma cotización (uno del 22 al 27-11 y
// otro del 29-11 al 04-12) caían los dos desde el Día 1, uno encima del
// otro. Con más de un día y casillas con contenido, el cotizador pregunta
// antes de cargar desde qué día parte el paquete; el Día 1 viene marcado
// (grupos en paralelo, lo de siempre). El selector es el mismo del «Día»
// de cada casilla: SectionChipSelect con el rótulo de `rotuloDeDia`.
//
// La pieza no carga nada: devuelve el paquete y el día elegido. Con
// `paquete` nulo no dibuja nada, así la pantalla la deja puesta siempre.

type Props<T extends { name: string }> = {
  paquete: T | null;
  diasDelEvento: number;
  rotuloDeDia: (dia: number) => string;
  onCargar: (paquete: T, desdeDia: number) => void;
  onCerrar: () => void;
};

export default function DesdeQueDiaParte<T extends { name: string }>({
  paquete,
  diasDelEvento,
  rotuloDeDia,
  onCargar,
  onCerrar,
}: Props<T>) {
  if (!paquete) return null;
  return (
    <Pregunta
      // Otra pregunta, otro paquete: vuelve a partir en el Día 1.
      key={paquete.name}
      paquete={paquete}
      diasDelEvento={diasDelEvento}
      rotuloDeDia={rotuloDeDia}
      onCargar={onCargar}
      onCerrar={onCerrar}
    />
  );
}

function Pregunta<T extends { name: string }>({
  paquete,
  diasDelEvento,
  rotuloDeDia,
  onCargar,
  onCerrar,
}: Props<T> & { paquete: T }) {
  const [dia, setDia] = useState(1);
  const dias = Math.max(1, Math.floor(diasDelEvento) || 1);
  return (
    <Modal
      titulo={`¿Desde qué día parte «${paquete.name}»?`}
      ancho="max-w-md"
      // Sin tope: la lista de días se abre dentro y el tope la cortaba.
      sinTope
      onCerrar={onCerrar}
      pie={
        <>
          <button
            type="button"
            onClick={onCerrar}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onCargar(paquete, Math.min(dia, dias));
              onCerrar();
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Cargar
          </button>
        </>
      }
    >
      <SectionChipSelect
        value={Math.min(dia, dias)}
        options={Array.from({ length: dias }, (_, i) => ({
          id: i + 1,
          name: rotuloDeDia(i + 1),
        }))}
        onChange={setDia}
        zeroLabel={null}
        size="md"
        title="Día del evento en que parte el paquete"
        ariaLabel="Día en que parte el paquete"
      />
      <p className="mt-2 text-xs text-gray-500">
        Día 1 = junto con lo que ya está (grupos en paralelo). Elige otro día
        si el programa viene después.
      </p>
    </Modal>
  );
}
