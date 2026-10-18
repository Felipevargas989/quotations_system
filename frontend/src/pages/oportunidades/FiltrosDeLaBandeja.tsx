import SelectWithSearch from "../../components/selects/SelectWithSearch";
import type {
  Semaforo,
  TipoProceso,
} from "../../services/oportunidades.service";
import { type Filtros, SEMAFOROS, VISTAS } from "./oportunidades.utils";
import { SELLO_DEL_TIPO } from "./tipoDeProceso";

// LOS FILTROS DE LA BANDEJA (Felipe, 18-10: "vamos con las 5"; sobre el
// boceto, "igual me gusta mucho más"). Arriba, los montones como botones
// redondeados con su número: reemplazan al desplegable «Por revisar», y
// no se confunden con las pestañas del módulo, que van subrayadas. Abajo,
// en una sola fila: el tipo con botones (cada uno con el color de su
// sello), la región, el semáforo y el buscador.

const TIPOS: ReadonlyArray<{ value: TipoProceso | ""; label: string }> = [
  { value: "", label: "Todas" },
  { value: "licitacion", label: "Licitaciones" },
  { value: "compra_agil", label: "Compras ágiles" },
];

export default function FiltrosDeLaBandeja({
  filtros,
  onCambiar,
  porVista,
  porSemaforo,
  regiones,
}: {
  readonly filtros: Filtros;
  readonly onCambiar: (cambios: Partial<Filtros>) => void;
  /** Lo que se va a ver al pinchar cada montón (`contarPorVista`).
   *  «Historial» va sin número: es todo. */
  readonly porVista: { readonly nueva: number; readonly descartada: number };
  readonly porSemaforo: Readonly<Record<Semaforo, number>>;
  readonly regiones: readonly string[];
}) {
  const alternarSemaforo = (s: Semaforo) =>
    onCambiar({
      semaforos: filtros.semaforos.includes(s)
        ? filtros.semaforos.filter((x) => x !== s)
        : [...filtros.semaforos, s],
    });

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label="Montones de la bandeja"
        className="flex w-full sm:inline-flex sm:w-auto gap-1 p-1 rounded-full bg-gray-100"
      >
        {VISTAS.map((v) => {
          const activa = filtros.vista === v.value;
          const n = v.value === "historial" ? null : porVista[v.value];
          return (
            <button
              key={v.value}
              type="button"
              aria-pressed={activa}
              title={v.ayuda}
              onClick={() => onCambiar({ vista: v.value })}
              // En el celular se reparten el ancho, sin partirse en dos
              // líneas (visto en el boceto del 18-10).
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-2.5 sm:px-3.5 py-1 text-[13px] sm:text-sm rounded-full transition-colors ${
                activa
                  ? "bg-white text-blue-700 font-semibold shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {v.label}
              {n !== null && (
                <span
                  className={`text-xs ${activa ? "text-blue-600" : "text-gray-500"}`}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Tipo"
          className="inline-flex rounded-lg border border-gray-300 overflow-hidden"
        >
          {TIPOS.map((t, i) => {
            const activo = filtros.tipo === t.value;
            return (
              <button
                key={t.label}
                type="button"
                aria-pressed={activo}
                onClick={() => onCambiar({ tipo: t.value })}
                className={`px-3 py-1.5 text-sm whitespace-nowrap ${
                  i > 0 ? "border-l border-gray-300" : ""
                } ${
                  !activo
                    ? "bg-white text-gray-600 hover:bg-gray-50"
                    : t.value
                      ? `${SELLO_DEL_TIPO[t.value]} font-semibold`
                      : "bg-gray-100 text-gray-900 font-semibold"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="w-full sm:w-52">
          <SelectWithSearch
            options={[
              { value: "", label: "Todas tus regiones" },
              ...regiones.map((r) => ({ value: r, label: r })),
            ]}
            value={filtros.region}
            onChange={(v) => onCambiar({ region: v })}
            sinLimpiar
            mostrarConteo={false}
            tamano="sm"
          />
        </div>

        {(Object.keys(SEMAFOROS) as Semaforo[]).map((s) => {
          const activo = filtros.semaforos.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => alternarSemaforo(s)}
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

        <input
          type="text"
          value={filtros.busca}
          onChange={(e) => onCambiar({ busca: e.target.value })}
          placeholder="Buscar nombre, organismo o código"
          className="flex-1 min-w-[12rem] px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
