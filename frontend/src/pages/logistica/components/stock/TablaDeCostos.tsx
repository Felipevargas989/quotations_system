import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Star,
  Tags,
  Truck,
} from "lucide-react";
import Tooltip from "../../../../components/Tooltip";
import {
  UNIT_FAMILY_INFO,
  type Supplier,
  type Supply,
} from "../../../../types/logistics.types";
import { matchesSearch } from "../../../../utils/searchMatch";
import {
  vigilarInsumo,
  type CompraSubida,
  type Equivalente,
} from "../../../../services/stock.service";
import { toast } from "../../../../components/toast/Toast";

// LOS COSTOS DE LOS INSUMOS (doc 25, 23-11-2026). Solo el costeo: la
// bodega salió (D16, Felipe: *"son muchos insumos, difícilmente voy a
// mantener actualizados los stocks… dejemos solamente lo que estamos
// desarrollando para meter el costeo que sea automático"*). Agrupados por
// proveedor (D13); los cortes o marcas de cada insumo se ven al pasar el
// mouse por su chip (D14).

const fmtCosto = (v: number) =>
  `$${v.toLocaleString("es-CL", { maximumFractionDigits: v < 100 ? 2 : 0 })}`;

export default function TablaDeCostos({
  supplies,
  proveedores,
  equivalentes,
  compras,
  vigilados,
  onCambio,
}: {
  readonly supplies: Supply[];
  readonly proveedores: Supplier[];
  readonly equivalentes: Equivalente[];
  readonly compras: CompraSubida[];
  readonly vigilados: number[];
  readonly onCambio: () => void;
}) {
  const [buscar, setBuscar] = useState("");
  const [guardando, setGuardando] = useState<number | null>(null);
  const estrella = async (id: number, vigilar: boolean) => {
    setGuardando(id);
    try {
      await vigilarInsumo(id, vigilar);
      onCambio();
    } catch {
      toast.error("No se pudo guardar la estrella.");
    } finally {
      setGuardando(null);
    }
  };
  // Los grupos de proveedor plegados a mano (por omisión, todos abiertos).
  const [plegados, setPlegados] = useState<Set<number>>(new Set());

  const eqPorInsumo = useMemo(() => {
    const m = new Map<number, Equivalente[]>();
    for (const e of equivalentes) {
      m.set(e.supply_id, [...(m.get(e.supply_id) ?? []), e]);
    }
    return m;
  }, [equivalentes]);

  // La última compra aplicada de cada insumo: cuenta toda línea ya
  // aplicada, aunque a su compra le queden líneas por revisar.
  const ultimaCompra = useMemo(() => {
    const m = new Map<number, string>();
    const orden = [...compras]
      .filter((c) => c.estado !== "descartada")
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    for (const c of orden) {
      for (const l of c.lineas) {
        if (l.estado !== "aplicada" || !l.supply_id || m.has(l.supply_id))
          continue;
        const dia = c.fecha
          ? `${c.fecha.slice(8, 10)}-${c.fecha.slice(5, 7)}`
          : "";
        m.set(
          l.supply_id,
          [l.equivalente, c.proveedor_texto, dia].filter(Boolean).join(" · "),
        );
      }
    }
    return m;
  }, [compras]);

  const filas = supplies
    .filter((s) => s.is_active !== false)
    .filter(
      (s) =>
        !buscar.trim() ||
        matchesSearch(
          buscar,
          s.name,
          ...(eqPorInsumo.get(s.id) ?? []).map((e) => e.nombre),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const nombreProv = new Map(proveedores.map((p) => [p.id, p.name]));
  const grupos = [
    ...filas
      .reduce((m, s) => {
        const k =
          s.supplier_id && nombreProv.has(s.supplier_id) ? s.supplier_id : 0;
        m.set(k, [...(m.get(k) ?? []), s]);
        return m;
      }, new Map<number, Supply[]>())
      .entries(),
  ].sort(([a], [b]) =>
    !a
      ? 1
      : !b
        ? -1
        : (nombreProv.get(a) ?? "").localeCompare(
            nombreProv.get(b) ?? "",
            "es",
          ),
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 pb-2">
        <Tags size={17} className="text-green-700" />
        <h3 className="text-base font-bold text-gray-900">
          Costos de los insumos
        </h3>
        <span className="relative ml-auto">
          <Search
            size={14}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar insumo, corte o marca"
            className="pl-7 pr-2 py-1.5 text-sm border border-gray-300 rounded-lg w-64"
          />
        </span>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm table-fixed">
          <colgroup>
            <col className="w-8" />
            <col />
            <col className="w-36" />
            <col className="w-[34%]" />
          </colgroup>
          <thead className="bg-white border-b-2 border-gray-300 text-[11px] uppercase tracking-wide text-gray-700">
            <tr>
              <th />
              <th className="px-3 py-2 text-left font-bold">Insumo</th>
              <th className="px-3 py-2 text-right font-bold">Costo</th>
              <th className="px-3 py-2 text-left font-bold">Última compra</th>
            </tr>
          </thead>
          {grupos.map(([provId, lista]) => {
            const plegado = plegados.has(provId) && !buscar.trim();
            return (
              <tbody
                key={provId}
                className="divide-y divide-gray-100 border-b border-gray-200"
              >
                <tr
                  className="bg-blue-50/60 hover:bg-blue-50 cursor-pointer"
                  onClick={() =>
                    setPlegados((prev) => {
                      const n = new Set(prev);
                      if (n.has(provId)) n.delete(provId);
                      else n.add(provId);
                      return n;
                    })
                  }
                >
                  <td className="px-2 py-2 border-l-4 border-blue-400">
                    {plegado ? (
                      <ChevronRight size={15} className="text-blue-500" />
                    ) : (
                      <ChevronDown size={15} className="text-blue-500" />
                    )}
                  </td>
                  <td colSpan={3} className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <Truck size={14} className="text-blue-400" />
                      <span className="text-xs font-bold uppercase text-blue-900">
                        {provId
                          ? nombreProv.get(provId)
                          : "Sin proveedor asignado"}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        · {lista.length} insumo{lista.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </td>
                </tr>
                {!plegado &&
                  lista.map((s) => {
                    const base = UNIT_FAMILY_INFO[s.unit_family]?.base ?? "";
                    const eqs = eqPorInsumo.get(s.id) ?? [];
                    return (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            disabled={guardando === s.id}
                            onClick={() =>
                              void estrella(s.id, !vigilados.includes(s.id))
                            }
                            title={
                              vigilados.includes(s.id)
                                ? "Dejar de vigilar"
                                : "Vigilar su costo"
                            }
                            className="disabled:opacity-40"
                          >
                            <Star
                              size={15}
                              className={
                                vigilados.includes(s.id)
                                  ? "text-amber-500 fill-amber-400"
                                  : "text-gray-300 hover:text-amber-400"
                              }
                            />
                          </button>
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="text-gray-900">{s.name}</span>
                          {(["corte", "marca"] as const).map((t) => {
                            const nombres = eqs
                              .filter((e) => e.tipo === t)
                              .map((e) => e.nombre);
                            if (!nombres.length) return null;
                            const texto = nombres.join(" · ");
                            return (
                              <span key={t} className="ml-1.5">
                                <Tooltip contenido={texto} titulo={texto}>
                                  <span
                                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                                      t === "corte"
                                        ? "bg-violet-100 text-violet-700"
                                        : "bg-sky-100 text-sky-700"
                                    }`}
                                  >
                                    {nombres.length} {t}
                                    {nombres.length === 1 ? "" : "s"}
                                  </span>
                                </Tooltip>
                              </span>
                            );
                          })}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {s.price ? (
                            `${fmtCosto(Number(s.price))}/${base}`
                          ) : (
                            <span className="text-amber-600 text-xs font-semibold">
                              sin costo
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-gray-500 truncate">
                          {ultimaCompra.get(s.id) ?? ""}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
}
