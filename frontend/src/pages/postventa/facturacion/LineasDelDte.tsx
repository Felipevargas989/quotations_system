import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import NumberInput from "../../../components/inputs/NumberInput";
import type { LineaPedida, Montos } from "../../../services/facturas.service";
import { claseCasilla } from "./datosDeLaFactura";

// LAS LÍNEAS DEL DTE (doc 19 §9.20): la descripción, la cantidad de
// personas, el precio con IVA y su total, y abajo el neto, el IVA y el
// total a pagar como los calcula el motor (los mismos que salen). Todo se
// edita a mano.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

const COLUMNAS = "sm:grid-cols-[1fr_5.5rem_8rem_7rem_1.25rem]";

export default function LineasDelDte({
  lineas,
  montos,
  onChange,
}: {
  readonly lineas: LineaPedida[];
  /** Los del motor; nulos si una línea no sirve todavía. */
  readonly montos: Montos | null;
  readonly onChange: (lineas: LineaPedida[]) => void;
}) {
  // Al agregar o quitar una línea, las casillas se vuelven a armar: así
  // ninguna se queda con el número de otra.
  const [version, setVersion] = useState(0);
  const poner = (i: number, cambios: Partial<LineaPedida>) =>
    onChange(lineas.map((l, j) => (j === i ? { ...l, ...cambios } : l)));
  const cambiarLineas = (nuevas: LineaPedida[]) => {
    setVersion((v) => v + 1);
    onChange(nuevas);
  };

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
      <div
        className={`hidden gap-2 text-xs font-semibold text-gray-500 sm:grid ${COLUMNAS}`}
      >
        <span>Descripción</span>
        <span className="text-right">Cantidad</span>
        <span className="text-right">Precio c/IVA</span>
        <span className="text-right">Total</span>
        <span />
      </div>
      {lineas.map((l, i) => (
        <div key={`${version}-${i}`} className="space-y-1">
          <div className={`grid items-center gap-2 ${COLUMNAS}`}>
            <input
              type="text"
              value={l.descripcion}
              maxLength={80}
              placeholder="Descripción"
              onChange={(e) => poner(i, { descripcion: e.target.value })}
              className={claseCasilla}
            />
            <NumberInput
              value={l.cantidad}
              min={0}
              placeholder="1"
              onChange={(v) => poner(i, { cantidad: v ?? 0 })}
              className="px-3 py-1.5 text-sm text-right"
            />
            <NumberInput
              value={l.precio}
              min={0}
              currency
              placeholder="0"
              onChange={(v) => poner(i, { precio: v ?? 0 })}
              className="px-3 py-1.5 text-sm text-right"
            />
            <span className="text-right text-sm text-gray-900">
              {clp(l.cantidad * l.precio)}
            </span>
            {lineas.length > 1 ? (
              <button
                type="button"
                title="Quitar la línea"
                onClick={() => cambiarLineas(lineas.filter((_, j) => j !== i))}
                className="text-gray-400 hover:text-red-600"
              >
                <Trash2 size={13} />
              </button>
            ) : (
              <span />
            )}
          </div>
          {l.descripcion_larga != null && (
            <label className="block">
              <span className="flex justify-between text-xs text-gray-500">
                Descripción larga
                <span>{Array.from(l.descripcion_larga).length}/1000</span>
              </span>
              <textarea
                value={l.descripcion_larga}
                maxLength={1000}
                rows={2}
                onChange={(e) =>
                  poner(i, { descripcion_larga: e.target.value })
                }
                className={`${claseCasilla} text-xs`}
              />
            </label>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          cambiarLineas([
            ...lineas,
            {
              descripcion: "",
              descripcion_larga: null,
              cantidad: 1,
              precio: 0,
            },
          ])
        }
        className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
      >
        <Plus size={13} /> Agregar línea
      </button>
      <dl className="ml-auto grid w-full grid-cols-2 sm:w-64 gap-x-3 text-sm">
        <dt className="text-gray-500">Neto</dt>
        <dd className="text-right">{montos ? clp(montos.neto) : "—"}</dd>
        <dt className="text-gray-500">IVA 19 %</dt>
        <dd className="text-right">{montos ? clp(montos.iva) : "—"}</dd>
        <dt className="font-semibold">Total a pagar</dt>
        <dd className="text-right font-semibold">
          {montos ? clp(montos.total) : "—"}
        </dd>
      </dl>
    </div>
  );
}
