import { useEffect, useMemo, useState } from "react";
import { Download, Package, TrendingUp, Users } from "lucide-react";
import { Quotation } from "../../types/quotations.types";
import { useAuth } from "../../contexts/AuthContext";
import {
  getAllRecipeItems,
  getCatalogServiceNameIds,
  getFixedServiceCostsById,
  getFurnitureItems,
  getSupplies,
} from "../../services/logistics.service";
import {
  FurnitureItem,
  RecipeItem,
  Supply,
  UNIT_FAMILY_INFO,
  toBaseQty,
} from "../../types/logistics.types";

// Gestión del evento: consolida los insumos y el mobiliario de las recetas,
// muestra los costos (según catálogo) y un resumen de rentabilidad estimada.
// Fase 4 agregará la asignación de recursos por evento (staff, arriendos)
// y el botón Provisionar que congela los costos.

interface ConsolidatedSupply {
  supply: Supply;
  totalBase: number; // en unidad base (kg / L / u)
  services: string[]; // de qué servicios proviene (para el desglose)
}

interface ConsolidatedFurniture {
  item: FurnitureItem;
  total: number; // redondeado hacia arriba (no existen 79,5 sillas)
}

interface FixedServiceCostRow {
  nombre: string;
  qty: number;
  costo: number; // (fijo + por persona × personas) × qty
  sinCosto: boolean; // no tiene costo definido en el catálogo
}

const fmtQty = (n: number) =>
  Number(n.toFixed(2)).toLocaleString("es-CL", { maximumFractionDigits: 2 });

const fmtMoney = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

export default function GestionTab({
  quote,
}: {
  readonly quote: Quotation;
}) {
  const { company } = useAuth();
  const companyId = company?.id ? Number(company.id) : null;
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);
  const [nameIds, setNameIds] = useState<{
    variable: Record<string, number>;
    fixed: Record<string, number>;
  }>({ variable: {}, fixed: {} });
  const [fixedCosts, setFixedCosts] = useState<
    Record<
      number,
      { cost_fixed: number | null; cost_per_person: number | null }
    >
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId === null) return;
    setLoading(true);
    Promise.all([
      getAllRecipeItems(companyId),
      getSupplies(companyId),
      getFurnitureItems(companyId),
      getCatalogServiceNameIds(companyId),
      getFixedServiceCostsById(companyId),
    ])
      .then(([r, s, f, n, fc]) => {
        setRecipes(r);
        setSupplies(s);
        setFurniture(f);
        setNameIds(n);
        setFixedCosts(fc);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  const personas = quote.people_count || 0;

  const { insumos, mobiliario, sinReceta, fijos, costoInsumos, costoFijos } =
    useMemo(() => {
      const supplyById = new Map(supplies.map((s) => [s.id, s]));
      const furnById = new Map(furniture.map((f) => [f.id, f]));

      // Índice de recetas por (tipo, servicio).
      const byService = new Map<string, RecipeItem[]>();
      recipes.forEach((r) => {
        const key = `${r.service_type}-${r.service_id}`;
        const arr = byService.get(key) || [];
        arr.push(r);
        byService.set(key, arr);
      });

      const supplyTotals = new Map<number, ConsolidatedSupply>();
      const furnTotals = new Map<number, ConsolidatedFurniture>();
      const noRecipe: string[] = [];
      const fixedRows: FixedServiceCostRow[] = [];

      // Resuelve el id del servicio: por codigo (cotizaciones nuevas) o por
      // nombre en el catálogo (cotizaciones antiguas con códigos tipo "P001").
      const resolveId = (
        serviceType: "variable" | "fixed",
        codigo: string,
        nombre: string,
      ): number | undefined => {
        const numericId = Number(codigo);
        if (
          Number.isFinite(numericId) &&
          byService.get(`${serviceType}-${numericId}`)
        ) {
          return numericId;
        }
        const idByName = nameIds[serviceType][nombre.trim().toLowerCase()];
        if (idByName !== undefined) return idByName;
        return Number.isFinite(numericId) ? numericId : undefined;
      };

      const addRecipeLines = (
        serviceType: "variable" | "fixed",
        serviceId: number | undefined,
        nombre: string,
        qty: number,
      ) => {
        const lines =
          serviceId !== undefined
            ? byService.get(`${serviceType}-${serviceId}`)
            : undefined;
        if (!lines || lines.length === 0) {
          noRecipe.push(nombre);
          return;
        }
        lines.forEach((line) => {
          // cantidad total = por persona × personas × cantidad del servicio
          const factor = personas * (qty || 1);
          if (line.item_kind === "insumo" && line.supply_id) {
            const supply = supplyById.get(line.supply_id);
            if (!supply) return;
            const base = toBaseQty(line.qty_per_person, line.unit) * factor;
            const cur = supplyTotals.get(supply.id);
            if (cur) {
              cur.totalBase += base;
              if (!cur.services.includes(nombre)) cur.services.push(nombre);
            } else {
              supplyTotals.set(supply.id, {
                supply,
                totalBase: base,
                services: [nombre],
              });
            }
          } else if (line.item_kind === "mobiliario" && line.furniture_id) {
            const item = furnById.get(line.furniture_id);
            if (!item) return;
            const total = line.qty_per_person * factor;
            const cur = furnTotals.get(item.id);
            if (cur) cur.total += total;
            else furnTotals.set(item.id, { item, total });
          }
        });
      };

      (quote.items?.variable_services || []).forEach((group) => {
        (group.items || []).forEach((it) => {
          const id = resolveId("variable", it.codigo, it.nombre);
          addRecipeLines("variable", id, it.nombre, it.quantity || 1);
        });
      });
      (quote.items?.fixed_services || []).forEach((it) => {
        const id = resolveId("fixed", it.codigo, it.nombre);
        addRecipeLines("fixed", id, it.nombre, it.quantity || 1);
        // Costo del servicio fijo (tercerización): fijo + por persona × N.
        const costs = id !== undefined ? fixedCosts[id] : undefined;
        const fijo = costs?.cost_fixed || 0;
        const porPersona = costs?.cost_per_person || 0;
        const costo = (fijo + porPersona * personas) * (it.quantity || 1);
        fixedRows.push({
          nombre: it.nombre,
          qty: it.quantity || 1,
          costo,
          sinCosto: fijo === 0 && porPersona === 0,
        });
      });

      const insumosArr = [...supplyTotals.values()].sort((a, b) =>
        a.supply.name.localeCompare(b.supply.name),
      );
      const cInsumos = insumosArr.reduce(
        (s, c) => s + c.totalBase * (c.supply.price || 0),
        0,
      );
      const cFijos = fixedRows.reduce((s, r) => s + r.costo, 0);

      return {
        insumos: insumosArr,
        mobiliario: [...furnTotals.values()]
          .map((m) => ({ ...m, total: Math.ceil(m.total) }))
          .sort((a, b) => a.item.name.localeCompare(b.item.name)),
        sinReceta: [...new Set(noRecipe)],
        fijos: fixedRows,
        costoInsumos: cInsumos,
        costoFijos: cFijos,
      };
    }, [recipes, supplies, furniture, nameIds, fixedCosts, quote, personas]);

  const costoTotal = costoInsumos + costoFijos;
  const montoTotal = quote.total_amount || 0;
  const margen = montoTotal - costoTotal;
  const margenPct = montoTotal > 0 ? (margen / montoTotal) * 100 : 0;
  const hayCostos = costoTotal > 0;
  const fijosSinCosto = fijos.filter((f) => f.sinCosto);

  // Descarga CSV (se abre directo en Excel; separador ; y decimales con coma,
  // formato es-CL). BOM para que Excel respete los acentos.
  const downloadExcel = () => {
    const lines: string[] = [];
    lines.push(`Gestión del evento;Cotización #${quote.quotation_number}`);
    lines.push(`Personas;${personas}`);
    lines.push("");
    lines.push("INSUMOS");
    lines.push("Insumo;Cantidad;Unidad;Costo estimado");
    insumos.forEach((c) => {
      const qty = fmtQty(c.totalBase).replace(".", "");
      const costo = Math.round(c.totalBase * (c.supply.price || 0));
      lines.push(
        `${c.supply.name};${qty};${UNIT_FAMILY_INFO[c.supply.unit_family].base};${costo}`,
      );
    });
    lines.push("");
    lines.push("MOBILIARIO");
    lines.push("Ítem;Cantidad");
    mobiliario.forEach((m) => {
      lines.push(`${m.item.name};${m.total}`);
    });
    if (fijos.length) {
      lines.push("");
      lines.push("SERVICIOS FIJOS (costo tercerización)");
      lines.push("Servicio;Cantidad;Costo estimado");
      fijos.forEach((f) => {
        lines.push(`${f.nombre};${f.qty};${Math.round(f.costo)}`);
      });
    }
    lines.push("");
    lines.push("RESUMEN");
    lines.push(`Monto cotizado;${Math.round(montoTotal)}`);
    lines.push(`Costo estimado (catálogo);${Math.round(costoTotal)}`);
    lines.push(`Margen estimado;${Math.round(margen)}`);
    if (sinReceta.length) {
      lines.push("");
      lines.push("SERVICIOS SIN RECETA (no incluidos)");
      sinReceta.forEach((n) => lines.push(n));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gestion_evento_${quote.quotation_number}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="py-10 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  const empty = insumos.length === 0 && mobiliario.length === 0;

  return (
    <div className="space-y-6">
      {/* ---------- Bloque 1: Insumos y equipo ---------- */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-gray-800">
              Insumos y equipo
            </h4>
            <p className="text-xs text-gray-500">
              Calculado de las recetas × {personas} personas. Solo lectura.
            </p>
          </div>
          {!empty && (
            <button
              type="button"
              onClick={downloadExcel}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <Download size={15} /> Excel
            </button>
          )}
        </div>

        {empty ? (
          <div className="text-center py-8 text-gray-500">
            <Package className="mx-auto mb-3 text-gray-300" size={34} />
            <p className="font-medium">Sin recetas que consolidar</p>
            <p className="text-sm mt-1 max-w-sm mx-auto">
              Los servicios de este evento aún no tienen receta definida. Se
              configuran una sola vez en Servicios (gorro de chef /
              calculadora).
            </p>
          </div>
        ) : (
          <>
            {insumos.length > 0 && (
              <div>
                <h5 className="text-xs font-bold uppercase text-gray-500 mb-1.5">
                  Insumos
                </h5>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Insumo
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Cantidad total
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Costo
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {insumos.map((c) => (
                        <tr key={c.supply.id}>
                          <td className="px-3 py-2">
                            <span className="text-gray-900">
                              {c.supply.name}
                            </span>
                            {c.services.length > 1 && (
                              <>
                                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-700">
                                  consolidado · {c.services.length} servicios
                                </span>
                                <div className="text-[11px] text-gray-400">
                                  {c.services.join(" + ")}
                                </div>
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                            {fmtQty(c.totalBase)}{" "}
                            {UNIT_FAMILY_INFO[c.supply.unit_family].base}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                            {c.supply.price
                              ? fmtMoney(c.totalBase * c.supply.price)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td
                          colSpan={2}
                          className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase"
                        >
                          Total insumos
                        </td>
                        <td className="px-3 py-2 text-right font-bold whitespace-nowrap">
                          {fmtMoney(costoInsumos)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {mobiliario.length > 0 && (
              <div>
                <h5 className="text-xs font-bold uppercase text-gray-500 mb-1.5">
                  Mobiliario
                </h5>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {mobiliario.map((m) => (
                        <tr key={m.item.id}>
                          <td className="px-3 py-2 text-gray-900">
                            {m.item.name}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {m.total.toLocaleString("es-CL")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  El costo del mobiliario va incluido en los recursos de cada
                  servicio fijo, no por ítem.
                </p>
              </div>
            )}
          </>
        )}

        {sinReceta.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-amber-800">
              ⚠ Servicios sin receta (no incluidos en el cálculo):
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {sinReceta.join(" · ")}
            </p>
          </div>
        )}
      </div>

      {/* ---------- Bloque 2: costos de servicios fijos ---------- */}
      {fijos.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-800 mb-1.5">
            Servicios fijos · costo de tercerización
          </h4>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Servicio
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Cant.
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Costo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fijos.map((f) => (
                  <tr key={f.nombre}>
                    <td className="px-3 py-2 text-gray-900">
                      {f.nombre}
                      {f.sinCosto && (
                        <span className="ml-1.5 text-[11px] text-amber-600">
                          ⚠ sin costo definido
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {f.qty}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                      {f.sinCosto ? "—" : fmtMoney(f.costo)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td
                    colSpan={2}
                    className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase"
                  >
                    Total servicios fijos
                  </td>
                  <td className="px-3 py-2 text-right font-bold whitespace-nowrap">
                    {fmtMoney(costoFijos)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ---------- Bloque 3: recursos del evento (fase 4) ---------- */}
      <div className="border border-dashed border-gray-300 rounded-lg p-4 flex items-center gap-3">
        <Users className="text-gray-300 shrink-0" size={22} />
        <div>
          <p className="text-sm font-semibold text-gray-500">
            Recursos del evento
          </p>
          <p className="text-xs text-gray-400">
            Próximamente: asignación de staff y arriendos con precio por
            evento, y el botón Provisionar que congela los costos.
          </p>
        </div>
      </div>

      {/* ---------- Bloque 4: rentabilidad estimada ---------- */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-gray-500" />
          <h4 className="text-sm font-bold text-gray-800">
            Rentabilidad estimada
          </h4>
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700">
            según catálogo
          </span>
        </div>
        {hayCostos ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] uppercase text-gray-500 font-semibold">
                  Monto cotizado
                </p>
                <p className="text-lg font-bold text-gray-900">
                  {fmtMoney(montoTotal)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-gray-500 font-semibold">
                  Costo estimado
                </p>
                <p className="text-lg font-bold text-gray-900">
                  {fmtMoney(costoTotal)}
                </p>
                <p className="text-[11px] text-gray-400">
                  insumos {fmtMoney(costoInsumos)} + fijos{" "}
                  {fmtMoney(costoFijos)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-gray-500 font-semibold">
                  Margen estimado
                </p>
                <p
                  className={`text-lg font-bold ${
                    margen >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {fmtMoney(margen)}
                  <span className="ml-1.5 text-sm font-semibold">
                    ({margenPct.toFixed(1)}%)
                  </span>
                </p>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-3">
              Estimado con precios de catálogo. No incluye staff ni recursos
              asignados por evento
              {fijosSinCosto.length > 0 &&
                ` · ${fijosSinCosto.length} servicio(s) fijo(s) sin costo definido`}
              . La rentabilidad real se calculará al provisionar.
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500 italic">
            Aún no hay costos que calcular: define recetas (insumos con
            precio) o costos de servicios fijos en el catálogo.
          </p>
        )}
      </div>
    </div>
  );
}
