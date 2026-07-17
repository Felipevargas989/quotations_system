import { useEffect, useMemo, useState } from "react";
import { Download, Package } from "lucide-react";
import { Quotation } from "../../types/quotations.types";
import { useAuth } from "../../contexts/AuthContext";
import {
  getAllRecipeItems,
  getCatalogServiceNameIds,
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

// Consolidación logística de un evento: recorre los servicios de la
// cotización (snapshot), busca sus recetas en el catálogo y suma los
// insumos (en unidad base) y el mobiliario × personas. Solo lectura + Excel.

interface ConsolidatedSupply {
  supply: Supply;
  totalBase: number; // en unidad base (kg / L / u)
  services: string[]; // de qué servicios proviene (para el desglose)
}

interface ConsolidatedFurniture {
  item: FurnitureItem;
  total: number; // redondeado hacia arriba (no existen 79,5 sillas)
}

const fmtQty = (n: number) =>
  Number(n.toFixed(2)).toLocaleString("es-CL", { maximumFractionDigits: 2 });

export default function LogisticaTab({
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId === null) return;
    setLoading(true);
    Promise.all([
      getAllRecipeItems(companyId),
      getSupplies(companyId),
      getFurnitureItems(companyId),
      getCatalogServiceNameIds(companyId),
    ])
      .then(([r, s, f, n]) => {
        setRecipes(r);
        setSupplies(s);
        setFurniture(f);
        setNameIds(n);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  const personas = quote.people_count || 0;

  const { insumos, mobiliario, sinReceta } = useMemo(() => {
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

    const addService = (
      serviceType: "variable" | "fixed",
      codigo: string,
      nombre: string,
      qty: number,
    ) => {
      // 1) intento por id (cotizaciones nuevas: codigo === id del servicio)
      const numericId = Number(codigo);
      let lines = Number.isFinite(numericId)
        ? byService.get(`${serviceType}-${numericId}`)
        : undefined;
      // 2) fallback por nombre (cotizaciones antiguas con códigos tipo "P001")
      if (!lines || lines.length === 0) {
        const idByName = nameIds[serviceType][nombre.trim().toLowerCase()];
        if (idByName !== undefined) {
          lines = byService.get(`${serviceType}-${idByName}`);
        }
      }
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
        addService("variable", it.codigo, it.nombre, it.quantity || 1);
      });
    });
    (quote.items?.fixed_services || []).forEach((it) => {
      addService("fixed", it.codigo, it.nombre, it.quantity || 1);
    });

    return {
      insumos: [...supplyTotals.values()].sort((a, b) =>
        a.supply.name.localeCompare(b.supply.name),
      ),
      mobiliario: [...furnTotals.values()]
        .map((m) => ({ ...m, total: Math.ceil(m.total) }))
        .sort((a, b) => a.item.name.localeCompare(b.item.name)),
      sinReceta: [...new Set(noRecipe)],
    };
  }, [recipes, supplies, furniture, nameIds, quote, personas]);

  // Descarga CSV (se abre directo en Excel; separador ; y decimales con coma,
  // formato es-CL). BOM para que Excel respete los acentos.
  const downloadExcel = () => {
    const lines: string[] = [];
    lines.push(`Logística del evento;Cotización #${quote.quotation_number}`);
    lines.push(`Personas;${personas}`);
    lines.push("");
    lines.push("INSUMOS");
    lines.push("Insumo;Cantidad;Unidad");
    insumos.forEach((c) => {
      const qty = fmtQty(c.totalBase).replace(".", "");
      lines.push(
        `${c.supply.name};${qty};${UNIT_FAMILY_INFO[c.supply.unit_family].base}`,
      );
    });
    lines.push("");
    lines.push("MOBILIARIO");
    lines.push("Ítem;Cantidad");
    mobiliario.forEach((m) => {
      lines.push(`${m.item.name};${m.total}`);
    });
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
    a.download = `logistica_evento_${quote.quotation_number}.csv`;
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-gray-800">
            Insumos y equipamiento del evento
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
        <div className="text-center py-10 text-gray-500">
          <Package className="mx-auto mb-3 text-gray-300" size={34} />
          <p className="font-medium">Sin recetas que consolidar</p>
          <p className="text-sm mt-1 max-w-sm mx-auto">
            Los servicios de este evento aún no tienen receta definida. Se
            configuran una sola vez en Servicios (gorro de chef / calculadora).
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
                      </tr>
                    ))}
                  </tbody>
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
  );
}
