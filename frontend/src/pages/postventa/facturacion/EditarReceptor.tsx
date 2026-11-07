import SelectWithSearch from "../../../components/selects/SelectWithSearch";
import type {
  BorradorDelDte,
  DtePedido,
  Receptor,
} from "../../../services/facturas.service";
import { formatearRut } from "../../../utils/rut";
import CamposDelReceptor from "./CamposDelReceptor";
import { OTRA } from "./datosDeLaFactura";
import ReferenciasDelDte from "./ReferenciasDelDte";

// Las referencias son las de `ReferenciasDelDte`, las mismas de «Nuevo
// documento» (doc 19 §9.22). Sin el check de «pedirla siempre» (Felipe:
// «saca el check no tiene sentido»): las referencias que pide cada cliente
// se llevan en su ficha (Datos de facturación → «Referencias que pide»).

/** «Editar receptor y referencias» de la factura (E4): a quién va y las
 *  referencias, antes de emitir. Las líneas se editan en el DTE mismo. */
export default function EditarReceptor({
  pedida,
  inicial,
  otra,
  elegirLaRazon,
  poner,
  ponerReceptor,
  elegirRazon,
}: {
  readonly pedida: DtePedido;
  readonly inicial: BorradorDelDte;
  readonly otra: boolean;
  readonly elegirLaRazon: boolean;
  readonly poner: (c: Partial<DtePedido>) => void;
  readonly ponerReceptor: (campo: keyof Receptor, valor: string) => void;
  readonly elegirRazon: (rut: string) => void;
}) {
  const r = pedida.receptor;
  return (
    <div className="space-y-3 rounded-lg bg-white p-3 border border-gray-200">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500">A nombre de</p>
        {elegirLaRazon && (
          <SelectWithSearch
            options={[
              ...inicial.razones.map((x) => ({
                value: x.rut,
                label: x.razon_social,
                hint: formatearRut(x.rut),
              })),
              { value: OTRA, label: "Otra razón social…" },
            ]}
            value={
              otra
                ? OTRA
                : inicial.razones.some((x) => x.rut === r.rut)
                  ? r.rut
                  : ""
            }
            onChange={(v) => v && elegirRazon(v)}
            placeholder="Elegir la razón social"
            tamano="sm"
          />
        )}
        <CamposDelReceptor receptor={r} onChange={ponerReceptor} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500">Referencias</p>
        <ReferenciasDelDte
          referencias={pedida.referencias}
          onChange={(referencias) => poner({ referencias })}
        />
      </div>
    </div>
  );
}
