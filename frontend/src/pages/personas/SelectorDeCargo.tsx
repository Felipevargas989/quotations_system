import Modal from "../../components/Modal";
import SelectWithSearch from "../../components/selects/SelectWithSearch";

// EL «+ CARGO» DE LA SÁBANA — en Personal Staff (15-08) y, desde el
// 09-11-2026, en cada evento: Felipe pidió que todo evento del rango se
// vea, tenga o no gente, y que se le pueda sumar un cargo desde ahí mismo
// sin volver a Gestión. Salió de SemanaTab, donde vivía como función
// interna (mapa 07 §10: candidato natural a extraer).

export interface CargoDelCatalogo {
  readonly id: number;
  readonly name: string;
  readonly type: string;
  readonly is_active: boolean;
}

/** Los cargos que se pueden sumar: los de personal, activos, que no estén
 *  ya a la vista. */
const cargosParaSumar = (
  catalogo: readonly CargoDelCatalogo[],
  yaVisibles: readonly number[],
) =>
  catalogo
    .filter(
      (r) =>
        r.type === "personal" &&
        r.is_active !== false &&
        !yaVisibles.includes(r.id),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

/** El "+ cargo": suma un cargo a la vista (de Staff o de un evento). */
export function SelectorDeCargo({
  catalogo,
  yaVisibles,
  onAgregar,
  aspecto = "caja",
  claseTexto,
}: {
  readonly catalogo: readonly CargoDelCatalogo[];
  readonly yaVisibles: readonly number[];
  readonly onAgregar: (id: number) => void;
  /** "texto": chico, sin caja, para que quepa al lado del nombre del
   *  evento en su misma línea (09-11-2026). Toma el tamaño de letra de
   *  quien lo envuelve. */
  readonly aspecto?: "caja" | "texto";
  /** En "texto": el color del evento. */
  readonly claseTexto?: string;
}) {
  const opciones = cargosParaSumar(catalogo, yaVisibles).map((r) => ({
    value: String(r.id),
    label: r.name,
  }));
  return (
    <SelectWithSearch
      options={opciones}
      value=""
      onChange={(v) => v && onAgregar(Number(v))}
      placeholder="+ cargo"
      tamano={aspecto === "texto" ? "base" : "sm"}
      mostrarConteo={false}
      aspecto={aspecto}
      claseTexto={claseTexto}
    />
  );
}

const rotuloLargo = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

/** Un evento todavía sin cargos: su «+» pregunta primero el cargo y
 *  después abre la casilla de ese día para poner a la persona. Un clic
 *  por cargo, sin desplegable: son pocos y así es más rápido. */
export function ElegirCargoDelEvento({
  catalogo,
  evento,
  dia,
  onElegir,
  onCerrar,
}: {
  readonly catalogo: readonly CargoDelCatalogo[];
  readonly evento: string;
  readonly dia: string;
  readonly onElegir: (cargoId: number) => void;
  readonly onCerrar: () => void;
}) {
  const cargos = cargosParaSumar(catalogo, []);
  return (
    <Modal
      titulo="¿Qué cargo?"
      subtitulo={`${evento} · ${rotuloLargo(dia)}`}
      ancho="max-w-md"
      onCerrar={onCerrar}
    >
      <div className="flex flex-wrap gap-2">
        {cargos.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onElegir(r.id)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:border-emerald-400 hover:bg-emerald-50"
          >
            {r.name}
          </button>
        ))}
        {cargos.length === 0 && (
          <p className="text-sm text-gray-500">
            No hay cargos activos: créalos en Personal → Staff → Cargos.
          </p>
        )}
      </div>
    </Modal>
  );
}
