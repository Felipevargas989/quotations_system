import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Warehouse, X } from "lucide-react";
import NumberInput from "../../../../components/inputs/NumberInput";
import { toast } from "../../../../components/toast/Toast";
import {
  UNIT_FAMILY_INFO,
  type Supply,
} from "../../../../types/logistics.types";
import { humanizeApiError } from "../../../../utils/apiErrors";
import { matchesSearch } from "../../../../utils/searchMatch";
import {
  agregarEquivalente,
  borrarEquivalente,
  moverBodega,
  type BodegaDeInsumo,
  type CompraSubida,
  type Equivalente,
} from "../../../../services/stock.service";

// LA BODEGA SIMPLE (doc 25 §4). Felipe: *"con el tengo ya se soluciona
// gran parte"*. «Tengo» fija el conteo; «Saqué» resta; las compras
// aplicadas suman solas y los eventos realizados restan solos por receta
// (lo calcula el motor). Abajo de cada insumo: sus cortes o marcas
// equivalentes y lo que movió la bodega desde el último conteo.

const fmtQty = (v: number) =>
  v.toLocaleString("es-CL", { maximumFractionDigits: 2 });
const fmtCosto = (v: number) =>
  `$${v.toLocaleString("es-CL", { maximumFractionDigits: v < 100 ? 2 : 0 })}`;
const fmtDia = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Santiago",
  });
};

const ROTULO = {
  tengo: { texto: "tengo", clase: "text-blue-700", signo: "" },
  compra: { texto: "compra", clase: "text-green-700", signo: "+" },
  saque: { texto: "saqué", clase: "text-red-600", signo: "−" },
  evento: { texto: "evento", clase: "text-red-600", signo: "−" },
} as const;

export default function TablaDeBodega({
  supplies,
  bodega,
  equivalentes,
  compras,
  onCambio,
}: {
  readonly supplies: Supply[];
  readonly bodega: BodegaDeInsumo[];
  readonly equivalentes: Equivalente[];
  readonly compras: CompraSubida[];
  readonly onCambio: () => void;
}) {
  const [buscar, setBuscar] = useState("");
  const [soloContados, setSoloContados] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [editando, setEditando] = useState<{
    id: number;
    tipo: "tengo" | "saque";
    valor?: number;
  } | null>(null);
  const [nuevoEq, setNuevoEq] = useState<{
    nombre: string;
    tipo: "corte" | "marca";
  }>({
    nombre: "",
    tipo: "corte",
  });

  const porInsumo = useMemo(
    () => new Map(bodega.map((b) => [b.supply_id, b])),
    [bodega],
  );
  const eqPorInsumo = useMemo(() => {
    const m = new Map<number, Equivalente[]>();
    for (const e of equivalentes) {
      const l = m.get(e.supply_id) ?? [];
      l.push(e);
      m.set(e.supply_id, l);
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
    .filter((s) => !soloContados || porInsumo.get(s.id)?.stock != null)
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

  const guardarMovimiento = async () => {
    if (!editando || editando.valor === undefined) return;
    try {
      await moverBodega(editando.id, editando.tipo, editando.valor);
      setEditando(null);
      onCambio();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo guardar"));
    }
  };

  const agregarEq = async (supplyId: number) => {
    const nombre = nuevoEq.nombre.trim();
    if (!nombre) return;
    try {
      await agregarEquivalente(supplyId, nombre, nuevoEq.tipo);
      setNuevoEq({ nombre: "", tipo: nuevoEq.tipo });
      onCambio();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo agregar"));
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 pb-2">
        <Warehouse size={17} className="text-green-700" />
        <h3 className="text-base font-bold text-gray-900">
          Insumos · costo y bodega
        </h3>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            className="rounded"
            checked={soloContados}
            onChange={() => setSoloContados((v) => !v)}
          />
          Solo los contados
        </label>
        <span className="relative">
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
            <col className="w-32" />
            <col className="w-[22%]" />
            <col className="w-28" />
            <col className="w-56" />
          </colgroup>
          <thead className="bg-white border-b-2 border-gray-300 text-[11px] uppercase tracking-wide text-gray-700">
            <tr>
              <th />
              <th className="px-3 py-2 text-left font-bold">Insumo</th>
              <th className="px-3 py-2 text-right font-bold">Costo</th>
              <th className="px-3 py-2 text-left font-bold">Última compra</th>
              <th className="px-3 py-2 text-right font-bold">En bodega</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map((s) => {
              const base = UNIT_FAMILY_INFO[s.unit_family]?.base ?? "";
              const b = porInsumo.get(s.id);
              const eqs = eqPorInsumo.get(s.id) ?? [];
              const cortes = eqs.filter((e) => e.tipo === "corte").length;
              const marcas = eqs.filter((e) => e.tipo === "marca").length;
              const open = abierto === s.id;
              const ed = editando?.id === s.id ? editando : null;
              return (
                <Fragment key={s.id}>
                  <tr className={open ? "bg-blue-50/40" : "hover:bg-gray-50"}>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => setAbierto(open ? null : s.id)}
                        className="text-gray-400 hover:text-gray-700"
                        aria-label={`Ver ${s.name}`}
                      >
                        {open ? (
                          <ChevronDown size={15} />
                        ) : (
                          <ChevronRight size={15} />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="text-gray-900">{s.name}</span>
                      {cortes > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-violet-100 text-violet-700">
                          {cortes} corte{cortes === 1 ? "" : "s"}
                        </span>
                      )}
                      {marcas > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-sky-100 text-sky-700">
                          {marcas} marca{marcas === 1 ? "" : "s"}
                        </span>
                      )}
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
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {b?.stock == null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <span
                          className={`font-semibold ${b.stock < 0 ? "text-red-600" : "text-gray-900"}`}
                          title={
                            b.stock < 0
                              ? "Salió más de lo contado: vuelve a contar"
                              : undefined
                          }
                        >
                          {fmtQty(b.stock)} {base}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {ed ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-gray-600">
                            {ed.tipo === "tengo" ? "Tengo" : "Saqué"}
                          </span>
                          {/* Enter guarda y Escape cierra: la tecla sube desde el campo. */}
                          <span
                            className="relative w-24"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void guardarMovimiento();
                              if (e.key === "Escape") setEditando(null);
                            }}
                          >
                            <NumberInput
                              value={ed.valor}
                              onChange={(v) =>
                                setEditando({ ...ed, valor: v ?? undefined })
                              }
                              min={0}
                              placeholder="0"
                              aria-label={`${ed.tipo === "tengo" ? "Tengo" : "Saqué"} de ${s.name}`}
                              className="w-full !rounded-md !py-0.5 !pl-1 !pr-6 text-sm text-right"
                            />
                            <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                              {base}
                            </span>
                          </span>
                          <button
                            type="button"
                            disabled={ed.valor === undefined}
                            onClick={() => void guardarMovimiento()}
                            className="px-2 py-0.5 text-xs font-bold text-white bg-blue-600 rounded-md disabled:opacity-40"
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditando(null)}
                            className="text-gray-400 hover:text-gray-700"
                            aria-label="Cancelar"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              setEditando({ id: s.id, tipo: "tengo" })
                            }
                            className="px-2 py-0.5 text-xs font-semibold rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50"
                          >
                            Tengo
                          </button>
                          <button
                            type="button"
                            disabled={b?.stock == null}
                            title={
                              b?.stock == null
                                ? "Primero cuenta cuánto hay con «Tengo»"
                                : undefined
                            }
                            onClick={() =>
                              setEditando({ id: s.id, tipo: "saque" })
                            }
                            className="px-2 py-0.5 text-xs font-semibold rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
                          >
                            Saqué
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-blue-50/40">
                      <td />
                      <td colSpan={5} className="px-3 pb-3 pt-1">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                              Equivalentes
                            </p>
                            <p className="text-[11px] text-gray-500 mb-2">
                              Cortes o marcas que valen lo mismo: la compra de
                              cualquiera actualiza el costo de este insumo.
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {eqs.map((e) => (
                                <span
                                  key={e.id}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${
                                    e.tipo === "corte"
                                      ? "bg-violet-100 text-violet-800"
                                      : "bg-sky-100 text-sky-800"
                                  }`}
                                >
                                  {e.nombre}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await borrarEquivalente(e.id);
                                        onCambio();
                                      } catch (err) {
                                        toast.error(
                                          humanizeApiError(
                                            err,
                                            "No se pudo quitar",
                                          ),
                                        );
                                      }
                                    }}
                                    className="opacity-60 hover:opacity-100"
                                    aria-label={`Quitar ${e.nombre}`}
                                  >
                                    <X size={11} />
                                  </button>
                                </span>
                              ))}
                              <span className="inline-flex items-center gap-1">
                                <span className="flex rounded-md border border-gray-300 overflow-hidden text-[11px] font-semibold">
                                  {(["corte", "marca"] as const).map((t) => (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() =>
                                        setNuevoEq((x) => ({ ...x, tipo: t }))
                                      }
                                      className={`px-1.5 py-0.5 ${
                                        nuevoEq.tipo === t
                                          ? "bg-gray-900 text-white"
                                          : "bg-white text-gray-500"
                                      }`}
                                    >
                                      {t}
                                    </button>
                                  ))}
                                </span>
                                <input
                                  value={nuevoEq.nombre}
                                  onChange={(e) =>
                                    setNuevoEq((x) => ({
                                      ...x,
                                      nombre: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") void agregarEq(s.id);
                                  }}
                                  placeholder={
                                    nuevoEq.tipo === "corte"
                                      ? "Punta paleta"
                                      : "Pedrito"
                                  }
                                  className="w-32 px-2 py-0.5 text-xs border border-gray-300 rounded-md"
                                />
                                <button
                                  type="button"
                                  onClick={() => void agregarEq(s.id)}
                                  className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                                >
                                  + Agregar
                                </button>
                              </span>
                            </div>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                              Movimientos de bodega
                            </p>
                            {!b?.historia.length ? (
                              <p className="text-xs text-gray-400">
                                Sin conteo todavía. Parte con «Tengo».
                              </p>
                            ) : (
                              <ul className="space-y-0.5 text-xs">
                                {b.historia.map((h, i) => {
                                  const r = ROTULO[h.tipo];
                                  return (
                                    <li key={i} className="flex gap-2">
                                      <span className="w-12 text-gray-400 tabular-nums">
                                        {fmtDia(h.cuando)}
                                      </span>
                                      <span
                                        className={`w-14 font-semibold ${r.clase}`}
                                      >
                                        {r.texto}
                                      </span>
                                      <span className="w-20 text-right tabular-nums">
                                        {r.signo}
                                        {fmtQty(h.cantidad)} {base}
                                      </span>
                                      <span className="text-gray-500 truncate">
                                        {h.detalle ?? ""}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
