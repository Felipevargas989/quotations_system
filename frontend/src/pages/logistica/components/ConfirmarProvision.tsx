import { CheckCircle2, Loader2 } from "lucide-react";
import Modal from "../../../components/Modal";
import {
  UNIT_FAMILY_INFO,
  grossQty,
  type Supply,
} from "../../../types/logistics.types";

// CONFIRMAR ANTES DE PROVISIONAR (doc 25 D20, 24-11-2026). Felipe: *"cuando
// pincho provisionar, sería bueno que abriera un modal con el detalle de lo
// que estoy provisionando antes de que provisione… como una confirmación"*.
// NO es el modal del 24-08 (ahí se escribía lo comprado y lo gastado, y
// salió con la D1): aquí no se escribe nada. Solo se mira lo que va a
// quedar provisionado, con el costo del catálogo, y se confirma.

export interface FilaAProvisionar {
  quotation_id: string;
  supply_id: number;
  qty_base: number;
  cost: number;
  supplier_name: string | null;
}

const SIN_PROVEEDOR = "Sin proveedor";

const fmtMoney = (v: number) => `$${Math.round(v).toLocaleString("es-CL")}`;
const fmtQty = (v: number) =>
  v.toLocaleString("es-CL", { maximumFractionDigits: 2 });

export default function ConfirmarProvision({
  filas,
  supplies,
  eventos,
  guardando,
  onConfirmar,
  onCerrar,
}: {
  readonly filas: FilaAProvisionar[];
  readonly supplies: Supply[];
  /** Los eventos de la lista: «#512 Cliente». */
  readonly eventos: { id: string; rotulo: string }[];
  readonly guardando: boolean;
  readonly onConfirmar: () => void;
  readonly onCerrar: () => void;
}) {
  const porId = new Map(supplies.map((s) => [s.id, s]));
  // Una fila por insumo (sumando los eventos), agrupadas por proveedor.
  const porInsumo = new Map<
    number,
    { base: number; costo: number; proveedor: string }
  >();
  for (const f of filas) {
    const a = porInsumo.get(f.supply_id) ?? {
      base: 0,
      costo: 0,
      proveedor: f.supplier_name ?? SIN_PROVEEDOR,
    };
    a.base += f.qty_base;
    a.costo += f.cost;
    porInsumo.set(f.supply_id, a);
  }
  const grupos = new Map<string, number[]>();
  for (const [sid, a] of porInsumo) {
    grupos.set(a.proveedor, [...(grupos.get(a.proveedor) ?? []), sid]);
  }
  const ordenados = [...grupos.entries()].sort(([a], [b]) => {
    if (a === SIN_PROVEEDOR) return 1;
    if (b === SIN_PROVEEDOR) return -1;
    return a.localeCompare(b, "es");
  });
  const total = filas.reduce((t, f) => t + f.cost, 0);
  const tocados = new Set(filas.map((f) => f.quotation_id));
  const evs = eventos.filter((e) => tocados.has(e.id));
  const nIns = porInsumo.size;

  return (
    <Modal
      titulo="¿Provisionar esto?"
      subtitulo={`${nIns} insumo${nIns === 1 ? "" : "s"} · ${evs.length} evento${evs.length === 1 ? "" : "s"} · ${fmtMoney(total)}`}
      ancho="max-w-3xl"
      bloquearEscape={guardando}
      onCerrar={onCerrar}
      pie={
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            Con el costo de hoy del catálogo.
          </span>
          <button
            type="button"
            disabled={guardando}
            onClick={onCerrar}
            className="ml-auto px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={guardando || !filas.length}
            onClick={onConfirmar}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {guardando ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <CheckCircle2 size={15} />
            )}
            {guardando ? "Provisionando…" : "Sí, provisionar"}
          </button>
        </div>
      }
    >
      {!filas.length && (
        <p className="text-sm text-amber-700 mb-3">
          No hay insumos que provisionar: los eventos elegidos no tienen receta
          o ya están provisionados.
        </p>
      )}
      <p className="text-xs text-gray-600 mb-3">
        {evs.map((e) => e.rotulo).join(" · ")}
      </p>
      <table className="min-w-full text-sm table-fixed">
        <colgroup>
          <col />
          <col className="w-32" />
          <col className="w-32" />
        </colgroup>
        <thead className="border-b-2 border-gray-300 text-[11px] uppercase tracking-wide text-gray-700">
          <tr>
            <th className="px-2 py-1.5 text-left font-bold">Insumo</th>
            <th className="px-2 py-1.5 text-right font-bold">Cantidad</th>
            <th className="px-2 py-1.5 text-right font-bold">Costo</th>
          </tr>
        </thead>
        {ordenados.map(([prov, ids]) => {
          const sub = ids.reduce(
            (t, id) => t + (porInsumo.get(id)?.costo ?? 0),
            0,
          );
          return (
            <tbody key={prov} className="divide-y divide-gray-100">
              <tr className="bg-blue-50/60">
                <td className="px-2 py-1.5 border-l-4 border-blue-400 text-xs font-bold uppercase text-blue-900">
                  {prov}
                </td>
                <td />
                <td className="px-2 py-1.5 text-right text-xs font-bold text-blue-900 tabular-nums">
                  {fmtMoney(sub)}
                </td>
              </tr>
              {ids
                .map((id) => ({ id, s: porId.get(id) }))
                .sort((a, b) =>
                  (a.s?.name ?? "").localeCompare(b.s?.name ?? "", "es"),
                )
                .map(({ id, s }) => {
                  const a = porInsumo.get(id);
                  if (!a) return null;
                  const unidad = s ? UNIT_FAMILY_INFO[s.unit_family]?.base : "";
                  return (
                    <tr key={id}>
                      <td className="px-2 py-1.5 text-gray-900 truncate">
                        {s?.name ?? `Insumo ${id}`}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {fmtQty(s ? grossQty(a.base, s) : a.base)} {unidad}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {a.costo ? (
                          fmtMoney(a.costo)
                        ) : (
                          <span className="text-xs font-semibold text-amber-600">
                            sin costo
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          );
        })}
        <tfoot>
          <tr className="border-t-2 border-gray-300">
            <td className="px-2 py-2 font-bold text-gray-900">Total</td>
            <td />
            <td className="px-2 py-2 text-right font-bold text-gray-900 tabular-nums">
              {fmtMoney(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </Modal>
  );
}
