import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ConfirmInline from "../../components/ConfirmInline";
import { Check, Users, X } from "lucide-react";
import {
  EventResource,
  addEventResource,
  addEventResources,
  createManagementResource,
  deleteEventResource,
  getAllFixedServiceCostItems,
  getEventResources,
  getManagementResources,
  getSuppliers,
  updateEventResource,
  updateManagementResource,
} from "../../services/logistics.service";
import {
  FixedServiceCostItem,
  ManagementResource,
  RESOURCE_TYPE_LABEL,
  ResourceType,
  Supplier,
  resourcePriceLabel,
} from "../../types/logistics.types";
import { NumberInput } from "../../components/inputs";
import SelectWithSearch from "../../components/selects/SelectWithSearch";

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");

// Inputs de dinero: texto con separador de miles es-CL (sin flechitas).
// Color del subgrupo por tipo de recurso.
const TYPE_PILL: Record<ResourceType, string> = {
  personal: "bg-teal-100 text-teal-700",
  arriendo: "bg-indigo-100 text-indigo-700",
  compra: "bg-rose-100 text-rose-700",
};

export interface EventFixedService {
  id: number; // id resuelto en el catálogo
  nombre: string;
  qty: number;
}

// Guard a nivel de módulo: evita la doble importación automática en
// StrictMode (efectos duplicados en desarrollo).
const importingFor = new Set<string>();

// Receta de la consulta de recursos, compartida con el precalentado del
// evento (03-08): UNA sola definición, frescura 0 intacta.
export const recursosQueryOpts = (companyId: number, quotationId: string) => ({
  queryKey: ["postventa", "recursos", companyId, quotationId],
  staleTime: 0,
  queryFn: async () => {
    const [l, r, s, ci] = await Promise.all([
      getEventResources(companyId, quotationId),
      getManagementResources(companyId),
      getSuppliers(companyId),
      getAllFixedServiceCostItems(companyId),
    ]);
    return { lines: l, resources: r, suppliers: s, costItems: ci };
  },
});

// Recursos asignados a UN evento (Fase 4): staff, arriendos y compras del
// catálogo. Los recursos de los SERVICIOS FIJOS del evento se importan
// automáticamente como líneas (instanciación, con chip de origen); el precio
// llega precargado desde la lista pero es editable por evento (rebajas
// negociadas; el staff se valoriza aquí). Seleccionar = agregar; autosave.
export default function EventResourcesSection({
  companyId,
  quotationId,
  personas,
  fixedServices,
  noCostIds,
  onCostChange,
  congelado = false,
}: {
  readonly companyId: number;
  readonly quotationId: string;
  readonly personas: number;
  readonly fixedServices: EventFixedService[];
  // Evento ya realizado (13-08): su contenido está congelado en el
  // servidor. Acá importa sobre todo por el auto-importe de más
  // abajo, que escribe con solo abrir la pestaña.
  readonly congelado?: boolean;
  // Fijos marcados "sin costo en Eventia" (migración 57): la
  // advertencia de sin-costo-definido los deja pasar.
  readonly noCostIds?: ReadonlySet<number>;
  readonly onCostChange: (total: number) => void;
}) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Mini-form de creación al vuelo (inline)
  const [newOpen, setNewOpen] = useState(false);
  const [nName, setNName] = useState("");
  const [nType, setNType] = useState<ResourceType>("personal");
  const [nPriceFixed, setNPriceFixed] = useState<number>(0);
  const [nPricePerPerson, setNPricePerPerson] = useState<number>(0);
  const [nSupplier, setNSupplier] = useState("");

  // Recursos del evento vía React Query (Etapa 5, frescura inmediata:
  // asignaciones = costos del evento). El prefijo ["postventa"] hace
  // que el embudo refreshAfterSave también los alcance.
  const recursosQuery = useQuery(recursosQueryOpts(companyId, quotationId));
  const lines = recursosQuery.data?.lines ?? [];
  const resources = recursosQuery.data?.resources ?? [];
  const suppliers = recursosQuery.data?.suppliers ?? [];
  const costItems = recursosQuery.data?.costItems ?? [];
  const loading = recursosQuery.isPending;
  const load = () =>
    queryClient.invalidateQueries({
      queryKey: ["postventa", "recursos", companyId, quotationId],
    });

  const resById = useMemo(
    () => new Map(resources.map((r) => [r.id, r])),
    [resources],
  );
  // Igual que resById: el chip "auto" arma su tooltip en cada pintado y
  // un find() por fila crece con el catálogo (revisión del 07-08).
  const fixedById = useMemo(
    () => new Map(fixedServices.map((fs) => [fs.id, fs])),
    [fixedServices],
  );
  const supName = (id: number | null | undefined) =>
    suppliers.find((s) => s.id === id)?.name;

  const lineTotal = (l: EventResource) =>
    ((l.price_fixed || 0) + (l.price_per_person || 0) * personas) *
    (l.quantity || 1);

  const total = lines.reduce((s, l) => s + lineTotal(l), 0);

  // Agrupación para la tabla: por tipo (personal → arriendo → compra) y,
  // dentro de cada grupo, ordenado por proveedor (sin proveedor al final).
  const grouped = useMemo(() => {
    const order: ResourceType[] = ["personal", "arriendo", "compra"];
    const byType = (t: ResourceType | undefined) =>
      lines.filter((l) => resById.get(l.resource_id)?.type === t);
    const sortLines = (ls: EventResource[]) =>
      [...ls].sort((a, b) => {
        const ra = resById.get(a.resource_id);
        const rb = resById.get(b.resource_id);
        const sa = supName(ra?.supplier_id) || "";
        const sb = supName(rb?.supplier_id) || "";
        if (sa && !sb) return -1;
        if (!sa && sb) return 1;
        return (
          sa.localeCompare(sb) || (ra?.name || "").localeCompare(rb?.name || "")
        );
      });
    const groups = order
      .map((type) => {
        const ls = sortLines(byType(type));
        return {
          type,
          label: RESOURCE_TYPE_LABEL[type],
          lines: ls,
          subtotal: ls.reduce((s, l) => s + lineTotal(l), 0),
        };
      })
      .filter((g) => g.lines.length > 0);
    // recursos cuyo catálogo fue eliminado: al final, sin grupo propio
    const orphans = lines.filter((l) => !resById.get(l.resource_id));
    if (orphans.length) {
      groups.push({
        type: "compra",
        label: "Otros",
        lines: orphans,
        subtotal: orphans.reduce((s, l) => s + lineTotal(l), 0),
      });
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, resources, suppliers, personas]);

  // Instanciación: servicios fijos del evento cuyos recursos aún no fueron
  // importados como líneas (tienen costo en el catálogo pero ninguna línea
  // con su origen). Los sin costo definido solo se informan.
  const itemsByService = useMemo(() => {
    const m = new Map<number, FixedServiceCostItem[]>();
    costItems.forEach((ci) => {
      const arr = m.get(ci.fixed_service_id) || [];
      arr.push(ci);
      m.set(ci.fixed_service_id, arr);
    });
    return m;
  }, [costItems]);

  const pendingServices = useMemo(() => {
    const originIds = new Set(
      lines.map((l) => l.origin_fixed_service_id).filter(Boolean),
    );
    return fixedServices.filter(
      (fs) =>
        (itemsByService.get(fs.id) || []).length > 0 && !originIds.has(fs.id),
    );
  }, [fixedServices, itemsByService, lines]);

  const noCostServices = useMemo(
    () =>
      fixedServices.filter(
        (fs) =>
          (itemsByService.get(fs.id) || []).length === 0 &&
          // Marcados "sin costo en Eventia": no son pendientes.
          !noCostIds?.has(fs.id),
      ),
    [fixedServices, itemsByService, noCostIds],
  );

  const importFromFixed = async (services: EventFixedService[]) => {
    if (!services.length || importingFor.has(quotationId)) return;
    importingFor.add(quotationId);
    try {
      const rows: Parameters<typeof addEventResources>[0] = [];
      services.forEach((fs) => {
        (itemsByService.get(fs.id) || []).forEach((ci) => {
          const r = resById.get(ci.resource_id);
          rows.push({
            company_id: companyId,
            quotation_id: quotationId,
            resource_id: ci.resource_id,
            quantity: (ci.quantity || 1) * (fs.qty || 1),
            price_fixed: r?.list_price_fixed || 0,
            price_per_person: r?.list_price_per_person || 0,
            origin_fixed_service_id: fs.id,
          });
        });
      });
      const { error } = await addEventResources(rows);
      if (error) setErr("No se pudieron importar los recursos");
      else flashSaved();
    } finally {
      importingFor.delete(quotationId);
    }
    load();
  };

  // Primera vez (evento sin recursos): importar automáticamente los recursos
  // de sus servicios fijos.
  // OJO (13-08): este efecto es el ÚNICO punto del sistema que escribe
  // por el solo hecho de ABRIR una pantalla. En un evento realizado el
  // servidor lo rechaza, así que sin este freno entrar a Gestión
  // dejaría el cartel rojo de "no se pudieron importar" para siempre.
  useEffect(() => {
    if (loading || congelado) return;
    if (lines.length === 0 && pendingServices.length > 0) {
      importFromFixed(pendingServices);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    onCostChange(total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  // Pista en el catálogo: último precio usado para este recurso.
  const updateLastPrice = (resourceId: number, fixed: number, pp: number) => {
    updateManagementResource(resourceId, { last_price: fixed + pp }).catch(
      () => {},
    );
  };

  // Seleccionar = agregar: precio de lista precargado, editable en la fila.
  const addLine = async (val: string) => {
    const r = resById.get(Number(val));
    if (!r) return;
    setErr(null);
    const { error } = await addEventResource({
      company_id: companyId,
      quotation_id: quotationId,
      resource_id: r.id,
      quantity: 1,
      price_fixed: r.list_price_fixed || 0,
      price_per_person: r.list_price_per_person || 0,
    });
    if (error) {
      setErr("No se pudo agregar el recurso");
      return;
    }
    flashSaved();
    load();
  };

  const saveLine = async (
    id: number,
    fields: Partial<
      Pick<EventResource, "quantity" | "price_fixed" | "price_per_person">
    >,
  ) => {
    const { error } = await updateEventResource(id, fields);
    if (error) {
      setErr("No se pudo guardar");
      return;
    }
    setErr(null);
    flashSaved();
    const line = lines.find((l) => l.id === id);
    if (line) {
      const merged = { ...line, ...fields };
      updateLastPrice(
        line.resource_id,
        merged.price_fixed || 0,
        merged.price_per_person || 0,
      );
    }
    // Parche quirúrgico del caché (la fila no salta) + confirmación.
    queryClient.setQueryData<{
      lines: EventResource[];
      resources: ManagementResource[];
      suppliers: Supplier[];
      costItems: FixedServiceCostItem[];
    }>(
      ["postventa", "recursos", companyId, quotationId],
      (prev) =>
        prev && {
          ...prev,
          lines: prev.lines.map((l) => (l.id === id ? { ...l, ...fields } : l)),
        },
    );
  };

  // Quitar un recurso ya asignado pasa por confirmacion inline (regla
  // de Post-Venta: nada delicado se borra de un clic).
  const [confirmLineId, setConfirmLineId] = useState<number | null>(null);
  const removeLine = async (id: number) => {
    const { error } = await deleteEventResource(id);
    if (!error) {
      setConfirmLineId(null);
      queryClient.setQueryData<{
        lines: EventResource[];
        resources: ManagementResource[];
        suppliers: Supplier[];
        costItems: FixedServiceCostItem[];
      }>(
        ["postventa", "recursos", companyId, quotationId],
        (prev) =>
          prev && {
            ...prev,
            lines: prev.lines.filter((l) => l.id !== id),
          },
      );
      load();
    }
  };

  const createResource = async () => {
    if (!nName.trim()) return;
    const { data, error } = await createManagementResource({
      company_id: companyId,
      name: nName.trim(),
      type: nType,
      supplier_id: nSupplier ? Number(nSupplier) : null,
      list_price_fixed: nPriceFixed || null,
      // Regla: el personal nunca se cobra por persona
      list_price_per_person:
        nType !== "personal" ? nPricePerPerson || null : null,
    });
    if (error || !data) {
      setErr("No se pudo crear el recurso");
      return;
    }
    setNewOpen(false);
    setNName("");
    setNPriceFixed(0);
    setNPricePerPerson(0);
    setNSupplier("");
    // agregar directo al evento
    await addEventResource({
      company_id: companyId,
      quotation_id: quotationId,
      resource_id: data.id,
      quantity: 1,
      price_fixed: data.list_price_fixed || 0,
      price_per_person: data.list_price_per_person || 0,
    });
    flashSaved();
    load();
  };

  const options = useMemo(() => {
    const order: ResourceType[] = ["personal", "arriendo", "compra"];
    return [...resources]
      .filter((r) => r.is_active !== false)
      // AQUÍ APARECEN TODOS LOS CARGOS, tengan precio o no.
      //
      // Hubo un filtro que escondía los cargos sin precio, con la idea de
      // que "sin precio = no se contrata". Felipe lo desarmó el 14-08 y
      // tenía razón: un garzón de PLANTA no cuesta y el mismo cargo con un
      // freelance sí. Lo que decide si una jornada cuesta plata es si LA
      // PERSONA es planta o freelance ese día — y eso es un atributo de la
      // persona, no del cargo.
      //
      // Cualquier cargo puede necesitar un freelance alguna vez: el día que
      // haya que traer una cocinera de afuera, "Cocina" tiene que estar acá
      // para poder agregarla. Con el filtro no se podía.
      //
      // El precio del cargo es solo una SUGERENCIA para ahorrar tecleo.
      .sort(
        (a, b) =>
          order.indexOf(a.type) - order.indexOf(b.type) ||
          a.name.localeCompare(b.name),
      )
      .map((r) => ({
        value: String(r.id),
        label: `${r.name} · ${RESOURCE_TYPE_LABEL[r.type]} · ${resourcePriceLabel(r)}${
          supName(r.supplier_id) ? ` · ${supName(r.supplier_id)}` : ""
        }`,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources, suppliers]);

  if (loading) {
    return (
      <div className="py-6 flex justify-center">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2 min-h-[54px]">
        <Users size={17} className="text-gray-600" />
        <h4 className="text-base font-bold text-gray-900">
          Recursos del evento
        </h4>
        {saved && (
          <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
            <Check size={13} /> Guardado
          </span>
        )}
        {err && <span className="text-xs text-red-600">{err}</span>}
        {congelado && (
          <span className="text-xs font-semibold text-gray-500">
            congelado
          </span>
        )}
      </div>
      <div
        aria-disabled={congelado}
        className={
          congelado ? "space-y-3 pointer-events-none opacity-60" : "space-y-3"
        }
      >
      <p className="text-xs text-gray-500 -mt-1">
        Incluye los recursos de los servicios fijos del evento (importados
        automáticamente) más lo que agregues. El precio llega desde la lista del
        catálogo pero se ajusta para este evento (rebajas, staff).
      </p>

      {pendingServices.length > 0 && lines.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3">
          <p className="text-xs text-amber-800">
            <span className="font-bold">Recursos sin importar:</span>{" "}
            {pendingServices.map((s) => s.nombre).join(" · ")}
          </p>
          <button
            type="button"
            onClick={() => importFromFixed(pendingServices)}
            className="shrink-0 px-2.5 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700"
          >
            Importar
          </button>
        </div>
      )}

      {/* Fijos del evento SIN costo en el catálogo: la advertencia que
          les corresponde (antes se calculaba y no se mostraba; la marca
          "sin receta" a fijos se eliminó — era ruido). */}
      {noCostServices.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-600">
            <span className="font-bold">
              Sin costo definido en el catálogo:
            </span>{" "}
            {noCostServices.map((s) => s.nombre).join(" · ")}
            <span className="text-gray-400">
              {" "}
              — se define en Servicios → ficha del servicio fijo → pestaña
              Costo.
            </span>
          </p>
        </div>
      )}

      <SelectWithSearch
        options={options}
        value=""
        onChange={addLine}
        placeholder="Buscar y agregar recurso (garzón, audiovisual…)"
        searchPlaceholder="Buscar recurso…"
        noResultsText="Sin resultados"
      />

      {!newOpen ? (
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800"
        >
          + ¿No está? Crear recurso nuevo
        </button>
      ) : (
        <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-2">
          <input
            value={nName}
            onChange={(e) => setNName(e.target.value)}
            placeholder="Nombre (ej: Garzón turno completo)"
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {(Object.keys(RESOURCE_TYPE_LABEL) as ResourceType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setNType(t)}
                className={`px-2 py-1 rounded-md border text-xs font-semibold ${
                  nType === t
                    ? "border-blue-600 bg-white text-blue-700"
                    : "border-gray-300 text-gray-500"
                }`}
              >
                {RESOURCE_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <NumberInput
                value={nPriceFixed || undefined}
                onChange={(v) => setNPriceFixed(v || 0)}
                min={0}
                formatThousands
                placeholder="0"
              />
              <p className="mt-0.5 text-[11px] text-gray-500">
                Fijo por evento
              </p>
            </div>
            <div>
              {nType === "personal" ? (
                <>
                  <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-400">
                    —
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    El personal se cobra por evento
                  </p>
                </>
              ) : (
                <>
                  <NumberInput
                    value={nPricePerPerson || undefined}
                    onChange={(v) => setNPricePerPerson(v || 0)}
                    min={0}
                    formatThousands
                    placeholder="0"
                  />
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    Por persona
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SelectWithSearch
                options={suppliers
                  .filter((s) => s.is_active)
                  .map((s) => ({ value: String(s.id), label: s.name }))}
                value={nSupplier}
                onChange={setNSupplier}
                placeholder="Proveedor (opcional)"
                searchPlaceholder="Buscar proveedor…"
                noResultsText="Sin resultados"
              />
            </div>
            <button
              type="button"
              onClick={() => setNewOpen(false)}
              className="text-xs text-gray-500"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={createResource}
              disabled={!nName.trim()}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              Crear y usar
            </button>
          </div>
        </div>
      )}

      {lines.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          Agrega los recursos de este evento: garzones, staff de cocina,
          arriendos…
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.label} className="space-y-1">
              {/* Encabezado del bloque: solo el pill (patrón Compras) */}
              <div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${TYPE_PILL[g.type]}`}
                >
                  {g.label}
                </span>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {/* table-fixed: mismos anchos de columna en los 3 bloques */}
                <table className="min-w-full text-sm table-fixed">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-[11px] font-medium text-gray-400 uppercase">
                        Recurso
                      </th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-medium text-gray-400 uppercase w-20">
                        Cant.
                      </th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-medium text-gray-400 uppercase w-32">
                        $ fijo
                      </th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-medium text-gray-400 uppercase w-32">
                        $ /persona
                      </th>
                      <th className="px-3 py-1.5 text-right text-[11px] font-medium text-gray-400 uppercase w-32">
                        Total
                      </th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {g.lines.map((l) => {
                      const r = resById.get(l.resource_id);
                      const hasListPrice =
                        r && (r.list_price_fixed || r.list_price_per_person);
                      // `!!` a propósito: `hasListPrice` puede valer el
                      // NÚMERO 0 (precio por persona en 0 y fijo vacío) y
                      // entonces `{isRebaja && ...}` pintaba un "0" suelto
                      // entre las etiquetas (revisión del 07-08).
                      const isRebaja = !!(
                        hasListPrice &&
                        ((l.price_fixed || 0) < (r?.list_price_fixed || 0) ||
                          (l.price_per_person || 0) <
                            (r?.list_price_per_person || 0))
                      );
                      if (confirmLineId === l.id) {
                        return (
                          <tr key={l.id} className="bg-red-50/60">
                            <td colSpan={6} className="px-3 py-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-900 truncate mr-3">
                                  {r?.name || "Recurso"}
                                </span>
                                <ConfirmInline
                                  question="¿Quitar este recurso del evento?"
                                  yesLabel="Sí, quitar"
                                  onYes={() => removeLine(l.id)}
                                  onNo={() => setConfirmLineId(null)}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      // El nombre manda su propia línea y las etiquetas van
                      // abajo (07-08, pillada de Felipe en la #400): en una
                      // columna angosta se partían por la mitad —"FL /
                      // Eventos", "de Audiovisual / básico"— y una píldora
                      // cortada en dos se lee pésimo. Se arman acá para no
                      // repetir las mismas condiciones dos veces (una para
                      // decidir si va el bloque y otra por etiqueta).
                      const proveedor = r ? supName(r.supplier_id) : "";
                      const fijoOrigen = l.origin_fixed_service_id
                        ? fixedById.get(l.origin_fixed_service_id)
                        : undefined;
                      const etiquetas: React.ReactNode[] = [];
                      if (proveedor)
                        etiquetas.push(
                          // Texto libre y sin límite de largo: acá NO va
                          // `whitespace-nowrap`. La tabla es `table-fixed`
                          // dentro de un `overflow-hidden`, así que un
                          // nombre que no puede cortarse se recorta en
                          // silencio (revisión del 07-08).
                          <span
                            key="prov"
                            className="text-[11px] text-gray-400"
                          >
                            {proveedor}
                          </span>,
                        );
                      if (isRebaja)
                        etiquetas.push(
                          <span
                            key="rebaja"
                            className="whitespace-nowrap rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700"
                          >
                            rebaja
                          </span>,
                        );
                      if (l.origin_fixed_service_id)
                        etiquetas.push(
                          // Antes decía "de <nombre del servicio fijo>" y era
                          // el elemento más ancho de la columna más angosta:
                          // 200 px para decir algo binario. GRIS, no ámbar ni
                          // morado: en esta misma pantalla el ámbar significa
                          // "te falta importar" —lo contrario de lo que marca
                          // este chip— y el morado es el color de la sección
                          // ARRIENDO. El nombre completo viaja en el título y,
                          // para quien no ve el tooltip, en el texto oculto.
                          <span
                            key="auto"
                            className="cursor-help whitespace-nowrap rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500"
                            title={
                              fijoOrigen
                                ? `Llegó solo al importar el servicio fijo "${fijoOrigen.nombre}"`
                                : "Llegó solo al importar un servicio fijo del evento"
                            }
                          >
                            auto
                            <span className="sr-only">
                              {fijoOrigen
                                ? `: importado del servicio fijo ${fijoOrigen.nombre}`
                                : ": importado de un servicio fijo"}
                            </span>
                          </span>,
                        );
                      return (
                        <tr key={l.id}>
                          <td className="px-3 py-2">
                            <div className="text-gray-900">
                              {r?.name || "Recurso eliminado"}
                            </div>
                            {etiquetas.length > 0 && (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {etiquetas}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <NumberInput
                              value={l.quantity || undefined}
                              min={0}
                              onCommit={(v) => {
                                if (v && v > 0 && v !== l.quantity)
                                  saveLine(l.id, { quantity: v });
                              }}
                              className="w-16 px-2 py-1 text-sm text-right"
                              aria-label="Cantidad"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <NumberInput
                              value={l.price_fixed || undefined}
                              placeholder="0"
                              min={0}
                              currency
                              onCommit={(v) => {
                                const val = v || 0;
                                if (val !== l.price_fixed)
                                  saveLine(l.id, { price_fixed: val });
                              }}
                              className="w-28 px-2 py-1 text-sm text-right"
                              aria-label="Precio fijo"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {r?.type === "personal" ? (
                              // Regla: el personal nunca se cobra por persona
                              <div
                                className="w-28 inline-block border border-gray-200 bg-gray-50 rounded-lg px-2 py-1 text-sm text-gray-300 text-right"
                                title="El personal se cobra por evento"
                              >
                                —
                              </div>
                            ) : (
                              <NumberInput
                                value={l.price_per_person || undefined}
                                placeholder="0"
                                min={0}
                                currency
                                onCommit={(v) => {
                                  const val = v || 0;
                                  if (val !== l.price_per_person)
                                    saveLine(l.id, { price_per_person: val });
                                }}
                                className="w-28 px-2 py-1 text-sm text-right"
                                aria-label="Precio por persona"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                            {clp(lineTotal(l))}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => setConfirmLineId(l.id)}
                              className="text-gray-300 hover:text-red-500"
                              aria-label="Quitar recurso"
                            >
                              <X size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Subtotal bajo los ítems (costumbre local) */}
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-1.5 text-right text-[11px] font-semibold text-gray-500 uppercase"
                      >
                        Subtotal {g.label.toLowerCase()}
                      </td>
                      <td className="px-3 py-1.5 text-right font-bold whitespace-nowrap">
                        {clp(g.subtotal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}

          {/* Total general de recursos */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">
              Total recursos
            </span>
            <span className="font-bold text-gray-900 whitespace-nowrap">
              {clp(total)}
            </span>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
