import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBaseLogistica } from "../../hooks/useBaseLogistica";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Package,
  TrendingUp,
} from "lucide-react";
import { Quotation } from "../../types/quotations.types";
import { useAuth } from "../../contexts/AuthContext";
import {
  PurchasingEvent,
  QuotationProvisioning,
  getAcceptedEvents,
  getAllRecipeItems,
  getCatalogServiceNameIds,
  getFurnitureItems,
  getQuotationProvisioning,
  getSupplies,
} from "../../services/logistics.service";
import {
  FurnitureItem,
  RecipeItem,
  Supply,
  UNIT_FAMILY_INFO,
} from "../../types/logistics.types";
import {
  EventItemsSnapshot,
  buildConsolidationContext,
  consolidateEvent,
  newAccumulator,
  servicesSignature,
} from "../../utils/eventConsolidation";
// La propina no es venta ni margen (24-07, Felipe): el porqué y la
// fórmula, en un solo lugar, están en utils/quotationMoney.
import { saleWithoutTip, tipAmountOf } from "../../utils/quotationMoney";
import EventResourcesSection, {
  EventFixedService,
} from "./EventResourcesSection";
import PhotoPopup from "../../components/PhotoPopup";

// Gestión del evento: consolida insumos (suma) y mobiliario (peak: se lava
// y reutiliza entre servicios), compara contra el stock del inventario
// —incluyendo eventos que compiten la misma fecha—, administra los
// recursos del evento y muestra la rentabilidad.

const isoDate = (d: unknown): string | null => {
  if (!d) return null;
  try {
    return new Date(d as string).toISOString().slice(0, 10);
  } catch {
    return null;
  }
};

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
  const [costoRecursos, setCostoRecursos] = useState(0);
  // Secciones plegables (acordado 22-07): parten PLEGADAS mostrando el
  // resumen en una línea, para que los recursos del evento queden a mano.
  // Abiertos por defecto (03-08): el plegado era por el modal angosto.
  const [openInsumos, setOpenInsumos] = useState(true);
  const [openMobiliario, setOpenMobiliario] = useState(true);
  const [photoView, setPhotoView] = useState<{
    url: string;
    title: string;
  } | null>(null);

  // Gestión (lectura de aprovisionamiento) vía React Query (Etapa 5,
  // frescura inmediata bajo el prefijo ["postventa"]).
  // FASE VELOCIDAD (28-07): el catálogo sale de la despensa compartida
  // (useBaseLogistica, misma clave que Compras/Dashboard/cotizador) —
  // antes esta pestaña re-pedía las mismas 4 listas con clave propia.
  // Acá solo se pide lo propio del evento (aprovisionamiento + eventos).
  const base = useBaseLogistica(companyId);
  const gestionQuery = useQuery({
    queryKey: ["postventa", "gestion", companyId, quote.id],
    enabled: companyId !== null,
    staleTime: 0,
    queryFn: async () => {
      const [pr, ev] = await Promise.all([
        getQuotationProvisioning(String(quote.id)),
        getAcceptedEvents(companyId!),
      ]);
      return {
        prov: pr,
        allEvents: ev,
      };
    },
  });
  const recipes = base.data?.recipes ?? [];
  const supplies = base.data?.supplies ?? [];
  const furniture = base.data?.furniture ?? [];
  const nameIds = base.data?.nameIds ?? { variable: {}, fixed: {} };
  const prov: QuotationProvisioning = gestionQuery.data?.prov ?? {
    provisioned_at: null,
    provisioned_cost: null,
    provisioned_people: null,
    provisioned_services: null,
  };
  const allEvents = gestionQuery.data?.allEvents ?? [];
  const loading =
    (gestionQuery.isPending || base.isPending) && companyId !== null;

  const personas = quote.people_count || 0;

  const {
    insumos,
    mobiliario,
    sinReceta,
    fijosServicios,
    costoInsumos,
    sameDayLabels,
  } = useMemo(() => {
    const ctx = buildConsolidationContext(
      recipes,
      supplies,
      furniture,
      nameIds,
      {},
    );
    const acc = newAccumulator();
    const r = consolidateEvent(
      quote.items as EventItemsSnapshot,
      personas,
      ctx,
      acc,
    );

    // Eventos que compiten por el mismo stock: RANGOS de fechas que se
    // topan (un evento multi-día retiene el mobiliario todos sus días; se
    // libera al día siguiente del último).
    const myStart = isoDate(quote.event_date);
    const myEnd = isoDate(quote.event_end_date) || myStart;
    const others =
      myStart && myEnd
        ? allEvents.filter((e) => {
            if (e.id === String(quote.id)) return false;
            const eStart = isoDate(e.event_date);
            if (!eStart) return false;
            const eEnd = isoDate(e.event_end_date) || eStart;
            return eStart <= myEnd && myStart <= eEnd;
          })
        : [];
    const othersNeed = new Map<number, number>();
    others.forEach((ev) => {
      const acc2 = newAccumulator();
      const r2 = consolidateEvent(
        ev.items as EventItemsSnapshot,
        ev.people_count || 0,
        ctx,
        acc2,
      );
      r2.furnPeak.forEach((p, itemId) => {
        othersNeed.set(
          itemId,
          (othersNeed.get(itemId) || 0) + Math.ceil(p.total),
        );
      });
    });

    const insumosArr = [...acc.supplyTotals.values()].sort((a, b) =>
      a.supply.name.localeCompare(b.supply.name),
    );

    const mob = [...r.furnPeak.entries()]
      .map(([itemId, p]) => ({
        item: ctx.furnById.get(itemId) as FurnitureItem,
        total: Math.ceil(p.total),
        peakService: p.peakService,
        preassembled: p.preassembled,
        others: othersNeed.get(itemId) || 0,
      }))
      .filter((m) => m.item)
      .sort((a, b) => a.item.name.localeCompare(b.item.name));

    return {
      insumos: insumosArr,
      mobiliario: mob,
      sinReceta: [...new Set(acc.noRecipe)],
      fijosServicios: r.fixedServices.filter(
        (f) => f.id !== undefined,
      ) as EventFixedService[],
      costoInsumos: r.costoInsumos,
      sameDayLabels: others.map((o) => `#${o.quotation_number}`),
    };
  }, [recipes, supplies, furniture, nameIds, quote, personas, allEvents]);

  // Si el evento está provisionado, los INSUMOS quedan congelados con la
  // foto de Compras; los recursos del evento son la foto negociada en sí.
  // Ítems de mobiliario cuya necesidad supera el stock (para que la
  // advertencia siga visible aunque la sección esté plegada).
  const mobFaltas = mobiliario.filter((m) => {
    const stock = m.item.stock || 0;
    return stock > 0 && m.total + m.others > stock;
  }).length;
  const mobConStock = mobiliario.filter((m) => (m.item.stock || 0) > 0).length;

  const provisioned = !!prov.provisioned_at;
  const costoBase =
    provisioned && prov.provisioned_cost !== null
      ? prov.provisioned_cost
      : costoInsumos;
  const costoTotal = costoBase + costoRecursos;
  // 24-07: la venta que se mide es SIN propina. La propina la paga el
  // cliente y pasa por la empresa, pero va entera al equipo: no es
  // margen. Antes se usaba total_amount pelado y el margen salía inflado.
  const propina = tipAmountOf(quote);
  const montoTotal = saleWithoutTip(quote);
  const margen = montoTotal - costoTotal;
  const margenPct = montoTotal > 0 ? (margen / montoTotal) * 100 : 0;
  const hayCostos = costoTotal > 0;

  // Advertencias post-provisión: cambios de personas o servicios vs la foto.
  const cambios = useMemo(() => {
    if (!provisioned) return [];
    const out: string[] = [];
    if (
      prov.provisioned_people !== null &&
      personas !== prov.provisioned_people
    ) {
      out.push(
        `Personas: provisionado con ${prov.provisioned_people}, ahora ${personas}`,
      );
    }
    if (prov.provisioned_services) {
      const now = servicesSignature(
        quote.items as Parameters<typeof servicesSignature>[0],
      );
      const key = (s: { nombre: string; quantity: number }) =>
        `${s.nombre}×${s.quantity}`;
      const before = new Set(prov.provisioned_services.map(key));
      const after = new Set(now.map(key));
      const beforeNames = new Set(
        prov.provisioned_services.map((s) => s.nombre),
      );
      const afterNames = new Set(now.map((s) => s.nombre));
      now.forEach((s) => {
        if (!before.has(key(s))) {
          out.push(
            beforeNames.has(s.nombre)
              ? `Cambió cantidad: ${s.nombre} (ahora ×${s.quantity})`
              : `Servicio agregado: ${s.nombre}`,
          );
        }
      });
      prov.provisioned_services.forEach((s) => {
        if (!after.has(key(s)) && !afterNames.has(s.nombre)) {
          out.push(`Servicio quitado: ${s.nombre}`);
        }
      });
    }
    return out;
  }, [provisioned, prov, personas, quote.items]);

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
      const costo = Math.round(c.costTotal);
      lines.push(
        `${c.supply.name};${qty};${UNIT_FAMILY_INFO[c.supply.unit_family].base};${costo}`,
      );
    });
    lines.push("");
    lines.push("MOBILIARIO (necesidad = máximo simultáneo, se reutiliza)");
    lines.push("Ítem;Necesidad;Stock;Otros eventos misma fecha");
    mobiliario.forEach((m) => {
      lines.push(
        `${m.item.name};${m.total};${m.item.stock || 0};${m.others || 0}`,
      );
    });
    lines.push("");
    lines.push("RESUMEN");
    // 24-07: el margen se mide sin propina. La propina se lista aparte
    // para que el Excel cuadre con lo que efectivamente paga el cliente.
    lines.push(`Venta sin propina;${Math.round(montoTotal)}`);
    if (propina > 0) {
      lines.push(`Propina (va al equipo, no es margen);${Math.round(propina)}`);
    }
    lines.push(
      `Costo (insumos${provisioned ? " congelados" : ""} + recursos);${Math.round(costoTotal)}`,
    );
    lines.push(`Margen;${Math.round(margen)}`);
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
      {/* ---------- Advertencias post-provisión ---------- */}
      {cambios.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-red-700">
            <AlertTriangle size={14} />
            El evento cambió después de provisionarse — revisa las compras:
          </p>
          <ul className="mt-1 text-xs text-red-700 list-disc pl-5">
            {cambios.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-red-500">
            Puedes re-provisionar en Logística → Compras para actualizar la
            foto.
          </p>
        </div>
      )}

      {/* La CONCLUSIÓN primero (03-08): rentabilidad al tope — venta,
          costo y margen a un vistazo, con el estado de provisión. */}
      {/* ---------- Bloque 4: rentabilidad estimada ---------- */}
      {hayCostos ? (
        <div>
          {/* 3 cajitas estilo Pagos (pedido de Felipe 03-08): sin título
              — las cifras hablan solas. El estado de la foto (catálogo /
              provisionado) vive como chip en la cajita del Costo. */}
          <div className="flex gap-4">
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-xs uppercase text-gray-500">
                {propina > 0 ? "Venta sin propina" : "Monto cotizado"}
              </p>
              <p className="text-lg font-bold">{fmtMoney(montoTotal)}</p>
              {propina > 0 && (
                <p className="text-[11px] text-gray-400">
                  + propina {fmtMoney(propina)} (va al equipo, no es margen)
                </p>
              )}
            </div>
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-xs uppercase text-gray-500 flex items-center gap-1.5">
                {provisioned ? "Costo" : "Costo estimado"}
                {prov.provisioned_at ? (
                  <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-green-100 text-green-700 normal-case">
                    Provisionado el{" "}
                    {new Date(prov.provisioned_at).toLocaleDateString("es-CL")}
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-blue-100 text-blue-700 normal-case">
                    según catálogo
                  </span>
                )}
              </p>
              <p className="text-lg font-bold">{fmtMoney(costoTotal)}</p>
              <p className="text-[11px] text-gray-400">
                {provisioned
                  ? `insumos congelados ${fmtMoney(costoBase)}`
                  : `insumos ${fmtMoney(costoInsumos)}`}
                {" + recursos "}
                {fmtMoney(costoRecursos)}
              </p>
            </div>
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-xs uppercase text-gray-500">
                {provisioned ? "Margen" : "Margen estimado"}
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
          <p className="text-[11px] text-gray-400 mt-2">
            {provisioned
              ? "Insumos congelados al provisionar; los recursos del evento son la foto negociada de este evento."
              : "Insumos estimados con precios de catálogo (se congelan al provisionar en Logística → Compras) + recursos del evento."}
            {propina > 0 &&
              " El margen se mide sobre la venta sin propina: la propina la paga el cliente pero va entera al equipo."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-500 italic">
          Aún no hay costos que calcular: define recetas (insumos con
          precio) o costos de servicios fijos en el catálogo.
        </p>
      )}

      {/* Dos columnas en pantallas anchas: cálculo solo-lectura a la
          izquierda, trabajo editable a la derecha. */}
      <div className="grid gap-6 xl:grid-cols-2 items-start">
      {/* ---------- Bloque 1: Insumos y equipo ---------- */}
      <div className="space-y-4">
        {/* Patrón de encabezado del modal (mismo que Recursos del evento y
            Ficha de cocina): icono + título text-base + divisoria. */}
        <div className="flex items-center gap-2 border-b border-gray-200 pb-2 min-h-[54px]">
          <Package size={17} className="text-gray-600" />
          <h4 className="text-base font-bold text-gray-900">
            Insumos y equipo
          </h4>
          {!empty && (
            <button
              type="button"
              onClick={downloadExcel}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <Download size={15} /> Excel
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 -mt-2">
          Calculado de las recetas × {personas} personas. Solo lectura.
        </p>

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
                <button
                  type="button"
                  onClick={() => setOpenInsumos((v) => !v)}
                  className="w-full flex items-center gap-1.5 py-1 mb-1 text-left hover:bg-gray-50 rounded-md px-1"
                >
                  {openInsumos ? (
                    <ChevronDown size={15} className="text-gray-500" />
                  ) : (
                    <ChevronRight size={15} className="text-gray-500" />
                  )}
                  <span className="text-xs font-bold uppercase text-gray-500">
                    Insumos
                  </span>
                  <span className="text-[11px] text-gray-400">
                    · {insumos.length} ítem{insumos.length === 1 ? "" : "s"}
                  </span>
                  <span className="ml-auto text-sm font-bold text-gray-900">
                    {fmtMoney(costoInsumos)}
                  </span>
                </button>
                {openInsumos && (
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
                            {c.supply.price ? fmtMoney(c.costTotal) : "—"}
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
                )}
              </div>
            )}

            {mobiliario.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setOpenMobiliario((v) => !v)}
                  className="w-full flex items-center gap-1.5 py-1 mb-1 text-left hover:bg-gray-50 rounded-md px-1"
                >
                  {openMobiliario ? (
                    <ChevronDown size={15} className="text-gray-500" />
                  ) : (
                    <ChevronRight size={15} className="text-gray-500" />
                  )}
                  <span className="text-xs font-bold uppercase text-gray-500">
                    Mobiliario
                  </span>
                  <span className="text-[11px] text-gray-400">
                    · {mobiliario.length} ítem
                    {mobiliario.length === 1 ? "" : "s"}
                  </span>
                  {/* La falta de stock NO se esconde al plegar */}
                  {mobFaltas > 0 ? (
                    <span className="ml-auto text-xs font-semibold text-red-600">
                      ⚠ {mobFaltas} con falta
                    </span>
                  ) : mobConStock > 0 ? (
                    <span className="ml-auto text-xs font-semibold text-green-600">
                      ✓ sin faltas
                    </span>
                  ) : (
                    <span className="ml-auto text-[11px] text-gray-400">
                      sin stock definido
                    </span>
                  )}
                </button>
                {openMobiliario && (
                <>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full text-sm table-fixed">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Ítem
                        </th>
                        <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase w-28">
                          Necesidad
                        </th>
                        <th className="px-2 py-2 text-right text-xs font-medium text-gray-500 uppercase w-24">
                          Stock
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-56">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {mobiliario.map((m) => {
                        const stock = m.item.stock || 0;
                        const needed = m.total + m.others;
                        const falta = needed - stock;
                        return (
                          <tr key={m.item.id}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {m.item.photo_url && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPhotoView({
                                        url: m.item.photo_url as string,
                                        title: m.item.name,
                                      })
                                    }
                                    className="shrink-0"
                                    title="Ver foto"
                                  >
                                    <img
                                      src={m.item.photo_url}
                                      alt={m.item.name}
                                      className="w-8 h-8 rounded-md object-cover border border-gray-200 hover:ring-2 hover:ring-blue-400"
                                    />
                                  </button>
                                )}
                                <div>
                                  <span className="text-gray-900">
                                    {m.item.name}
                                  </span>
                                  {m.preassembled ? (
                                    <div className="text-[11px] text-gray-400">
                                      se anticipa · suma entre servicios
                                    </div>
                                  ) : (
                                    m.peakService && (
                                      <div className="text-[11px] text-gray-400">
                                        peak en {m.peakService}
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right font-semibold">
                              {m.total.toLocaleString("es-CL")}
                            </td>
                            <td className="px-2 py-2 text-right text-gray-600">
                              {stock > 0 ? stock.toLocaleString("es-CL") : "—"}
                            </td>
                            <td className="px-3 py-2">
                              {stock <= 0 ? (
                                <span className="text-[11px] text-gray-400">
                                  sin stock definido
                                </span>
                              ) : falta > 0 ? (
                                <span className="text-xs font-semibold text-red-600">
                                  ⚠ faltan {falta.toLocaleString("es-CL")}
                                  {m.others > 0 &&
                                    ` (compite con ${sameDayLabels.join(", ")})`}
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-green-600">
                                  ✓ alcanza
                                  {m.others > 0 &&
                                    ` (compartido con ${sameDayLabels.join(", ")})`}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  La necesidad es el máximo simultáneo entre servicios (se
                  lava y reutiliza); los ítems de preparación anticipada se
                  suman. El costo del mobiliario va en los recursos del
                  evento.
                </p>
                </>
                )}
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

      {/* ---------- Bloque 2: recursos del evento ---------- */}
      {companyId !== null && (
        <EventResourcesSection
          companyId={companyId}
          quotationId={String(quote.id)}
          personas={personas}
          fixedServices={fijosServicios}
          onCostChange={setCostoRecursos}
        />
      )}
      </div>

      {photoView && (
        <PhotoPopup
          url={photoView.url}
          title={photoView.title}
          onClose={() => setPhotoView(null)}
        />
      )}
    </div>
  );
}
