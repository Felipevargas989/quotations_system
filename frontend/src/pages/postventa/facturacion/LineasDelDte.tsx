import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import NumberInput from "../../../components/inputs/NumberInput";
import SelectWithSearch from "../../../components/selects/SelectWithSearch";
import type { ItemDelTarifario } from "../../../services/boletas.service";
import type { LineaPedida, Montos } from "../../../services/facturas.service";
import {
  claseCasilla,
  claseTitulo,
  lineaAMano,
  lineaDelTarifario,
  valorDeLaLinea,
} from "./datosDeLaFactura";

// LAS LÍNEAS DEL DTE (doc 19 §9.20): la descripción, la cantidad de
// personas, el precio con IVA y su total, y abajo el neto, el IVA y el
// total a pagar como los calcula el motor (los mismos que salen). Todo se
// edita a mano. Las tres casillas van del mismo alto que las demás del DTE
// (`claseCasilla`, el py-2 del campo numérico). La descripción larga va
// plegada en cada línea (Felipe, 06-11: «ok»): «+ Descripción larga» la
// abre, y «Quitar» la saca del DTE; si BelIA trae el texto largo de la OC,
// ya viene abierta.
//
// La factura de «Nuevo documento» (§9.23) suma las líneas del tarifario: se
// elige el ítem y su nombre y su precio vienen de ahí (el motor los vuelve
// a poner); la persona pone la cantidad. Recepción, solo esas
// (`soloTarifario`); el administrador, también a mano.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

const COLUMNAS = "sm:grid-cols-[1fr_5.5rem_8rem_7rem_1.25rem]";
// La factura (§9.22) suma el descuento en %, antes del total.
const COLUMNAS_CON_DESCUENTO =
  "sm:grid-cols-[1fr_5.5rem_8rem_5rem_7rem_1.25rem]";

/** El neto, el IVA y el total a pagar como los calcula el motor. */
export function TotalesDelDte({ montos }: { readonly montos: Montos | null }) {
  return (
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
  );
}

export default function LineasDelDte({
  lineas,
  montos,
  onChange,
  sinMarco = false,
  conDescuento = false,
  tarifario,
  soloTarifario = false,
}: {
  readonly lineas: LineaPedida[];
  /** Los del motor; nulos si una línea no sirve todavía. */
  readonly montos: Montos | null;
  readonly onChange: (lineas: LineaPedida[]) => void;
  /** «Nuevo documento» (§9.22): las líneas van dentro de su sección, sin
   *  marco propio, y los totales van en «Totales». */
  readonly sinMarco?: boolean;
  /** La factura lleva el descuento en % por línea (§9.22); la boleta no. */
  readonly conDescuento?: boolean;
  /** Los ítems del tarifario, para las líneas que salen de ahí (§9.23). */
  readonly tarifario?: ItemDelTarifario[];
  /** Sin líneas a mano: solo del tarifario (recepción, D3). */
  readonly soloTarifario?: boolean;
}) {
  const activos = (tarifario ?? []).filter((t) => t.activo);
  const columnas = conDescuento ? COLUMNAS_CON_DESCUENTO : COLUMNAS;
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
    <div
      className={
        sinMarco
          ? "space-y-2"
          : "space-y-2 rounded-lg border border-gray-200 bg-white p-3"
      }
    >
      <div
        className={`hidden gap-2 text-xs font-semibold text-gray-500 sm:grid ${columnas}`}
      >
        <span>Descripción</span>
        <span className="text-right">Cantidad</span>
        <span className="text-right">Precio c/IVA</span>
        {conDescuento && <span className="text-right">Desc. %</span>}
        <span className="text-right">Total</span>
        <span />
      </div>
      {lineas.map((l, i) => (
        <div key={`${version}-${i}`} className="space-y-1">
          <div className={`grid items-center gap-2 ${columnas}`}>
            {l.tarifario_id === undefined ? (
              <input
                type="text"
                value={l.descripcion}
                maxLength={80}
                placeholder="Descripción"
                onChange={(e) => poner(i, { descripcion: e.target.value })}
                className={claseCasilla}
              />
            ) : (
              <SelectWithSearch
                options={activos.map((t) => ({
                  value: String(t.id),
                  label: t.nombre,
                  hint: `${clp(t.precio)} por ${t.unidad}`,
                }))}
                value={l.tarifario_id == null ? "" : String(l.tarifario_id)}
                onChange={(v) => {
                  const item = activos.find((t) => String(t.id) === v);
                  poner(i, {
                    tarifario_id: item?.id ?? null,
                    descripcion: item?.nombre ?? "",
                    precio: item?.precio ?? 0,
                  });
                }}
                placeholder="Elegir del tarifario"
              />
            )}
            <NumberInput
              value={l.cantidad}
              min={0}
              placeholder="1"
              onChange={(v) => poner(i, { cantidad: v ?? 0 })}
              className="text-sm text-right"
            />
            {l.tarifario_id === undefined ? (
              <NumberInput
                value={l.precio}
                min={0}
                currency
                placeholder="0"
                onChange={(v) => poner(i, { precio: v ?? 0 })}
                className="text-sm text-right"
              />
            ) : (
              // El precio del tarifario no se toca (D3).
              <span
                title="El precio del tarifario"
                className={`${claseCasilla} bg-gray-50 text-right text-gray-700`}
              >
                {clp(l.precio)}
              </span>
            )}
            {conDescuento && (
              <NumberInput
                value={l.descuento ?? undefined}
                min={0}
                max={99.99}
                placeholder="0"
                onChange={(v) => poner(i, { descuento: v || null })}
                className="text-sm text-right"
              />
            )}
            <span className="text-right text-sm text-gray-900">
              {clp(valorDeLaLinea(l))}
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
          {l.descripcion_larga != null ? (
            <div>
              <div className={claseTitulo}>
                Descripción larga
                <span className="flex items-center gap-2">
                  {Array.from(l.descripcion_larga).length}/1000
                  <button
                    type="button"
                    onClick={() => poner(i, { descripcion_larga: null })}
                    className="font-semibold hover:text-red-600"
                  >
                    Quitar
                  </button>
                </span>
              </div>
              <textarea
                value={l.descripcion_larga}
                maxLength={1000}
                rows={2}
                aria-label="Descripción larga"
                onChange={(e) =>
                  poner(i, { descripcion_larga: e.target.value })
                }
                className={`${claseCasilla} text-xs`}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => poner(i, { descripcion_larga: "" })}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <Plus size={12} /> Descripción larga
            </button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() =>
            cambiarLineas([
              ...lineas,
              soloTarifario ? lineaDelTarifario() : lineaAMano(),
            ])
          }
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
        >
          <Plus size={13} /> Agregar línea
        </button>
        {!soloTarifario && activos.length > 0 && (
          <button
            type="button"
            onClick={() => cambiarLineas([...lineas, lineaDelTarifario()])}
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
          >
            <Plus size={13} /> Del tarifario
          </button>
        )}
      </div>
      {!sinMarco && <TotalesDelDte montos={montos} />}
    </div>
  );
}
