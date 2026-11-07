import { Plus, Trash2 } from "lucide-react";
import SelectWithSearch from "../../../components/selects/SelectWithSearch";
import { REFERENCIAS_QUE_PIDE } from "../../../constants/facturacion";
import type { ReferenciaPedida } from "../../../services/facturas.service";
import { claseCasilla } from "./datosDeLaFactura";

// LAS REFERENCIAS DE LA FACTURA (doc 19 §9.20 y §9.22), las mismas en el
// evento (Post-Venta) y en «Nuevo documento». Una grilla: cada título sobre
// su casilla. El tipo en su caja, angosta, y el folio ancho (Felipe, 06-11:
// «el tipo más chiquito, el folio más grande»); la fecha («importante») y
// el motivo, opcional, que va en la factura (hasta 90). Cada tipo va una
// vez. «+ Agregar referencia» es un botón azul chico, como «+ Agregar
// línea». En el teléfono, el tipo con el folio y la fecha con el motivo.

const COLUMNAS =
  "grid-cols-2 sm:grid-cols-[12rem_minmax(9rem,1fr)_10rem_minmax(0,1.3fr)_1.25rem]";
const TITULO = "hidden self-end text-xs leading-tight text-gray-500 sm:block";
const LARGO_DEL_MOTIVO = 90;

export default function ReferenciasDelDte({
  referencias,
  onChange,
}: {
  readonly referencias: ReferenciaPedida[];
  readonly onChange: (referencias: ReferenciaPedida[]) => void;
}) {
  const sinUsar = REFERENCIAS_QUE_PIDE.filter(
    (x) => !referencias.some((y) => y.tipo === x.codigo),
  );
  const poner = (i: number, cambios: Partial<ReferenciaPedida>) =>
    onChange(referencias.map((x, j) => (j === i ? { ...x, ...cambios } : x)));

  return (
    <div className="space-y-2">
      {referencias.length > 0 && (
        <div className={`grid items-center gap-2 ${COLUMNAS}`}>
          <span className={TITULO}>Tipo</span>
          <span className={TITULO}>Folio</span>
          <span className={TITULO}>Fecha</span>
          <span className={TITULO}>Motivo (opcional)</span>
          <span className="hidden sm:block" />
          {referencias.map((x, i) => (
            <div key={x.tipo} className="contents">
              <SelectWithSearch
                options={REFERENCIAS_QUE_PIDE.filter(
                  (t) =>
                    t.codigo === x.tipo ||
                    !referencias.some((y) => y.tipo === t.codigo),
                ).map((t) => ({
                  value: t.codigo,
                  label: `${t.codigo} · ${t.nombre}`,
                }))}
                value={x.tipo}
                onChange={(v) => v && poner(i, { tipo: v })}
                tamano="sm"
                sinLimpiar
                mostrarConteo={false}
              />
              <input
                type="text"
                value={x.folio}
                maxLength={18}
                placeholder="N°"
                aria-label={`Folio de la referencia ${i + 1}`}
                onChange={(e) => poner(i, { folio: e.target.value })}
                className={claseCasilla}
              />
              <input
                type="date"
                value={x.fecha}
                aria-label={`Fecha de la referencia ${i + 1}`}
                onChange={(e) => poner(i, { fecha: e.target.value })}
                className={claseCasilla}
              />
              <input
                type="text"
                value={x.razon ?? ""}
                maxLength={LARGO_DEL_MOTIVO}
                placeholder="Motivo (opcional)"
                aria-label={`Motivo de la referencia ${i + 1}`}
                onChange={(e) => poner(i, { razon: e.target.value || null })}
                className={claseCasilla}
              />
              <button
                type="button"
                title="Quitar la referencia"
                onClick={() => onChange(referencias.filter((_, j) => j !== i))}
                className="col-span-2 justify-self-end text-gray-400 hover:text-red-600 sm:col-span-1 sm:justify-self-auto"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {sinUsar.length > 0 && (
        <button
          type="button"
          onClick={() =>
            onChange([
              ...referencias,
              { tipo: sinUsar[0].codigo, folio: "", fecha: "" },
            ])
          }
          className="flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
        >
          <Plus size={13} /> Agregar referencia
        </button>
      )}
    </div>
  );
}
