import NumberInput from "../../../components/inputs/NumberInput";
import RutInput from "../../../components/inputs/RutInput";
import SelectWithSearch from "../../../components/selects/SelectWithSearch";
import { Plus, Trash2 } from "lucide-react";
import {
  LARGO_MAXIMO,
  REFERENCIAS_QUE_PIDE,
  nombreDeReferencia,
} from "../../../constants/facturacion";
import type {
  BorradorDeFactura,
  FacturaPedida,
  Receptor,
  ReferenciaPedida,
} from "../../../services/facturas.service";
import { formatearRut } from "../../../utils/rut";
import Casilla from "./CasillaDeLaFactura";
import { DEL_RECEPTOR, OTRA, claseCasilla } from "./datosDeLaFactura";

/** «Editar a mano» (E4): todo lo de la factura, antes de emitir. */
export default function EditarFacturaAMano({
  pedida,
  inicial,
  totalActual,
  otra,
  elegirLaRazon,
  poner,
  ponerReceptor,
  ponerReferencia,
  siempre,
  elegirRazon,
}: {
  readonly pedida: FacturaPedida;
  readonly inicial: BorradorDeFactura;
  /** El total de la vista previa: al pasar a «un monto», parte de él. */
  readonly totalActual: number;
  readonly otra: boolean;
  readonly elegirLaRazon: boolean;
  readonly poner: (c: Partial<FacturaPedida>) => void;
  readonly ponerReceptor: (campo: keyof Receptor, valor: string) => void;
  readonly ponerReferencia: (i: number, c: Partial<ReferenciaPedida>) => void;
  readonly siempre: (codigo: string, si: boolean) => void;
  readonly elegirRazon: (rut: string) => void;
}) {
  const r = pedida.receptor;
  const porMonto = pedida.monto != null;
  const sinUsar = REFERENCIAS_QUE_PIDE.filter(
    (x) => !pedida.referencias.some((y) => y.tipo === x.codigo),
  );
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
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-gray-500">RUT</span>
            <RutInput
              value={r.rut}
              onChange={(rut) => ponerReceptor("rut", rut)}
              placeholder="RUT"
              className="text-sm"
            />
          </label>
          <Casilla
            etiqueta="Razón social"
            valor={r.razon_social}
            largo={LARGO_MAXIMO.razon_social}
            onChange={(v) => ponerReceptor("razon_social", v)}
          />
          {DEL_RECEPTOR.map((c) => (
            <Casilla
              key={c.campo}
              etiqueta={c.nombre}
              valor={r[c.campo]}
              largo={c.largo}
              onChange={(v) => ponerReceptor(c.campo, v)}
            />
          ))}
          <Casilla
            etiqueta="Ciudad"
            valor={r.ciudad}
            largo={LARGO_MAXIMO.ciudad}
            onChange={(v) => ponerReceptor("ciudad", v)}
          />
        </div>
        <Casilla
          etiqueta="Correos (facturacion.cl le manda la factura)"
          valor={r.correo}
          largo={LARGO_MAXIMO.correo_facturacion}
          onChange={(v) => ponerReceptor("correo", v)}
        />
      </div>

      <div className="space-y-2">
        <Casilla
          etiqueta="Detalle"
          valor={pedida.detalle.descripcion}
          largo={80}
          onChange={(v) =>
            poner({ detalle: { ...pedida.detalle, descripcion: v } })
          }
        />
        <label className="block">
          <span className="flex justify-between text-xs text-gray-500">
            Descripción larga (opcional)
            <span>
              {Array.from(pedida.detalle.descripcion_larga ?? "").length}/1000
            </span>
          </span>
          <textarea
            value={pedida.detalle.descripcion_larga ?? ""}
            maxLength={1000}
            rows={2}
            onChange={(e) =>
              poner({
                detalle: {
                  ...pedida.detalle,
                  descripcion_larga: e.target.value || null,
                },
              })
            }
            className={claseCasilla}
          />
        </label>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold text-gray-500">
          Cuánto se factura {inicial.oc ? "de la OC" : "del evento"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => poner({ porcentaje: 100, monto: null })}
            className={`px-2.5 py-1 text-xs rounded-lg font-semibold ${!porMonto ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            Un %
          </button>
          <button
            type="button"
            onClick={() =>
              poner({ porcentaje: null, monto: pedida.monto ?? totalActual })
            }
            className={`px-2.5 py-1 text-xs rounded-lg font-semibold ${porMonto ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            Un monto con IVA
          </button>
          <div className="w-40">
            {porMonto ? (
              <NumberInput
                value={pedida.monto ?? undefined}
                min={0}
                currency
                placeholder="0"
                onChange={(v) => poner({ monto: v ?? 0 })}
                className="px-3 py-1.5 text-sm"
              />
            ) : (
              <NumberInput
                value={pedida.porcentaje ?? undefined}
                min={0}
                max={100}
                placeholder="100"
                onChange={(v) => poner({ porcentaje: v ?? null })}
                className="px-3 py-1.5 text-sm"
              />
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500">Referencias</p>
        {pedida.referencias.map((x, i) => (
          <div
            key={x.tipo}
            className="flex flex-wrap items-center gap-2 text-xs"
          >
            <span className="w-40 font-semibold text-gray-700">
              {x.tipo} · {nombreDeReferencia(x.tipo)}
            </span>
            <input
              type="text"
              value={x.folio}
              maxLength={18}
              placeholder="N°"
              onChange={(e) => ponerReferencia(i, { folio: e.target.value })}
              className="w-40 px-2 py-1 text-sm border border-gray-300 rounded-lg"
            />
            <input
              type="date"
              value={x.fecha}
              onChange={(e) => ponerReferencia(i, { fecha: e.target.value })}
              className="px-2 py-1 text-sm border border-gray-300 rounded-lg"
            />
            <label className="flex items-center gap-1 text-gray-600">
              <input
                type="checkbox"
                checked={pedida.pedir_siempre.includes(x.tipo)}
                onChange={(e) => siempre(x.tipo, e.target.checked)}
              />
              Siempre
            </label>
            <button
              type="button"
              title="Quitar la referencia"
              onClick={() =>
                poner({
                  referencias: pedida.referencias.filter((_, j) => j !== i),
                })
              }
              className="text-gray-400 hover:text-red-600"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {sinUsar.length > 0 && (
          <div className="flex items-center gap-2">
            <Plus size={13} className="text-blue-600" />
            <div className="w-64">
              <SelectWithSearch
                options={sinUsar.map((x) => ({
                  value: x.codigo,
                  label: `${x.codigo} · ${x.nombre}`,
                }))}
                value=""
                onChange={(v) =>
                  v &&
                  poner({
                    referencias: [
                      ...pedida.referencias,
                      { tipo: v, folio: "", fecha: "" },
                    ],
                  })
                }
                placeholder="Agregar referencia"
                tamano="sm"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
