import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { pluralDeLaUnidad } from "../../constants/boletas";
import { getLoVendido } from "../../services/caja.service";
import { Seccion } from "./PiezasDelDocumento";

// LO VENDIDO (doc 19 §9.43, sprint 3; Felipe, 09-11: *"también debo poder
// ver cuántos tickets, cuántas tinajas, etc. se han vendido"*): lo vendido
// en «Nuevo DTE» (boletas y facturas del período sin evento), sin lo
// anulado, por ítem con su cantidad y su monto con IVA (las líneas a mano,
// «A mano · …», por lo que dicen), y por persona si se elige
// (quien abrió la caja; fuera de la caja, quien emitió). Este mes, si no se
// dice otra cosa. Lo ve quien revisa los cierres de la caja.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
/** AAAA-MM-DD de hoy en la hora de acá. */
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const casilla =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

/** «19 personas», «1 noche», «7»: la cantidad con su unidad. */
const cantidadCon = (cantidad: number, unidad: string) =>
  unidad === "unidad"
    ? String(cantidad)
    : `${cantidad} ${cantidad === 1 ? unidad : pluralDeLaUnidad(unidad)}`;

export default function LoVendido() {
  const [desde, setDesde] = useState(() => `${hoy().slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoy);
  const [persona, setPersona] = useState("");
  const valido = !!desde && !!hasta && desde <= hasta;
  const vendido = useQuery({
    queryKey: ["caja", "vendido", desde, hasta, persona],
    queryFn: () => getLoVendido({ desde, hasta, persona: persona || null }),
    enabled: valido,
  });
  const datos = vendido.data;
  return (
    <Seccion titulo="Lo vendido">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="text-xs text-gray-500">Desde</span>
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => e.target.value && setDesde(e.target.value)}
            className={casilla}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Hasta</span>
          <input
            type="date"
            value={hasta}
            min={desde}
            onChange={(e) => e.target.value && setHasta(e.target.value)}
            className={casilla}
          />
        </label>
        <div role="group" aria-label="Persona" className="block min-w-0">
          <span className="text-xs text-gray-500">Persona</span>
          <SelectWithSearch
            options={[
              { value: "", label: "Todas" },
              ...(datos?.personas ?? []).map((p) => ({ value: p, label: p })),
            ]}
            value={persona}
            onChange={(v) => setPersona(v ?? "")}
            tamano="sm"
            sinLimpiar
            mostrarConteo={false}
          />
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <span className="block text-xs text-gray-500">Total</span>
          <span className="text-lg font-semibold text-gray-900">
            {datos ? clp(datos.total) : "—"}
          </span>
        </div>
      </div>
      {!valido ? (
        <p className="text-xs text-red-600">«Desde» va antes que «Hasta».</p>
      ) : vendido.isPending ? (
        <p className="text-sm text-gray-400">Sumando lo vendido…</p>
      ) : !datos || datos.items.length === 0 ? (
        <p className="text-sm text-gray-500">No hay ventas en esas fechas.</p>
      ) : (
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="w-[60%] pb-1 font-normal">Ítem</th>
              <th className="pb-1 text-right font-normal">Cantidad</th>
              <th className="pb-1 text-right font-normal">Monto</th>
            </tr>
          </thead>
          <tbody>
            {datos.items.map((i) => (
              <tr
                key={`${i.tarifario_id}-${i.nombre}`}
                className="border-t border-gray-100"
              >
                <td className="py-1.5">{i.nombre}</td>
                <td className="py-1.5 text-right">
                  {cantidadCon(i.cantidad, i.unidad)}
                </td>
                <td className="py-1.5 text-right">{clp(i.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Seccion>
  );
}
