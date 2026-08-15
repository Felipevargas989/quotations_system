import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ConfirmInline from "../../components/ConfirmInline";
import { AlertTriangle, CalendarPlus, Check, Users, X } from "lucide-react";
import GrillaDeDias, {
  type FilaGrillaDias,
} from "../../components/grilla/GrillaDeDias";
import {
  EventResource,
  addEventResource,
  addEventResources,
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
  Supplier,
} from "../../types/logistics.types";
import { NumberInput } from "../../components/inputs";
import SelectWithSearch from "../../components/selects/SelectWithSearch";

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");
const iso = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);

const DIA_MS = 86_400_000;


const sumarDias = (isoDia: string, n: number) =>
  new Date(new Date(`${isoDia}T00:00:00Z`).getTime() + n * DIA_MS)
    .toISOString()
    .slice(0, 10);

// Máximo 4 días antes del inicio y 4 después del término (Felipe, 15-08):
// preparativos y desarme razonables, no un calendario infinito.
const TOPE_DIAS_EXTRA = 4;

const diasEntre = (desde: string, hasta: string | null): string[] => {
  const ini = new Date(`${desde}T00:00:00Z`).getTime();
  const fin = new Date(`${hasta || desde}T00:00:00Z`).getTime();
  if (isNaN(ini) || isNaN(fin) || fin < ini) return [desde];
  const out: string[] = [];
  for (let t = ini; t <= fin; t += DIA_MS)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
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

/**
 * LA MATEMÁTICA DEL COSTO (15-08, definida con Felipe):
 *
 * El día es la unidad que multiplica — "para el arriendo no es lo mismo
 * un día que tres" (opción A). PERO en los servicios MIXTOS el fijo es
 * POR EVENTO, no por día: solo la parte por persona multiplica.
 *
 *   · solo fijo (toldo):        fijo × unidades-día
 *   · solo variable (masajes):  variable × personas × unidades-día
 *   · mixto (catering):         fijo UNA VEZ + variable × personas × unidades-día
 *
 * donde unidades-día = la suma de las cantidades de todos sus días.
 * El personal cae en el primer caso: la jornada × su valor.
 *
 * Se calcula POR RECURSO (agrupando sus líneas), no por línea: si fuera
 * por línea, el fijo del mixto se cobraría una vez por día.
 */
const costoDelEvento = (lines: EventResource[], personas: number): number => {
  const grupos = new Map<
    number,
    { pp: number; fijo: number; unidades: number; sumaFijoPorLinea: number }
  >();
  for (const l of lines) {
    const g = grupos.get(l.resource_id) ?? {
      pp: 0,
      fijo: 0,
      unidades: 0,
      sumaFijoPorLinea: 0,
    };
    g.pp = Math.max(g.pp, l.price_per_person || 0);
    if (!g.fijo) g.fijo = l.price_fixed || 0;
    g.unidades += l.quantity || 0;
    g.sumaFijoPorLinea += (l.price_fixed || 0) * (l.quantity || 0);
    grupos.set(l.resource_id, g);
  }
  let total = 0;
  for (const g of grupos.values()) {
    if (g.pp > 0) total += g.fijo + g.pp * personas * g.unidades;
    // Sin variable, cada línea con su propio valor × cantidad — así el
    // personal con jornadas a valores distintos suma exacto.
    else total += g.sumaFijoPorLinea;
  }
  return total;
};

interface FilaArriendo {
  id: number;
  nombre: string;
  proveedor?: string;
  auto: boolean;
  fijo: number;
  pp: number;
  porDia: Map<string, EventResource>;
  sinRepartir: EventResource[];
  lineas: EventResource[];
  huerfana: boolean;
}

// ARRIENDOS Y SERVICIOS EXTERNOS — LA MISMA ESTRUCTURA QUE PERSONAL
//
// Grilla de días (15-08, pedido de Felipe): un toldo también se asigna a
// días concretos. La grilla NO aparece por defecto — solo cuando un
// servicio fijo vendido trae un arriendo incorporado (el auto-importe) o
// cuando se agrega uno con el botón. "No llenamos innecesariamente la
// pantalla".
//
// El valor viene preestablecido del catálogo; acá se trabaja EL DÍA.
// El personal no se muestra ni se agrega acá: vive en la grilla de
// Personal de esta misma pestaña. Sus líneas igual suman al costo total
// que viaja por onCostChange.
export default function EventResourcesSection({
  companyId,
  quotationId,
  personas,
  fixedServices,
  noCostIds,
  onCostChange,
  eventDate,
  eventEndDate,
  congelado = false,
}: {
  readonly companyId: number;
  readonly quotationId: string;
  readonly personas: number;
  readonly fixedServices: EventFixedService[];
  readonly eventDate: string | null;
  readonly eventEndDate: string | null;
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
  const [extras, setExtras] = useState<string[]>([]);
  // Ítems agregados que aún no tienen cantidad en ningún día: viven acá
  // hasta que el primer + cree su primera línea.
  const [nuevos, setNuevos] = useState<number[]>([]);
  const [confirmRowId, setConfirmRowId] = useState<number | null>(null);

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

  // Tras un clic en cantidades solo cambian LAS LÍNEAS: se sincronizan
  // ellas solas (una consulta) en vez de recargar las cuatro
  // ("la navegabilidad es lenta", Felipe 15-08). `load()` queda para lo
  // que sí toca el catálogo: importar y crear.
  const setLines = (fn: (ls: EventResource[]) => EventResource[]) =>
    queryClient.setQueryData(
      ["postventa", "recursos", companyId, quotationId],
      (prev: { lines: EventResource[] } | undefined) =>
        prev && { ...prev, lines: fn(prev.lines) },
    );
  const sincronizarLineas = async () => {
    const l = await getEventResources(companyId, quotationId);
    setLines(() => l);
  };

  const resById = useMemo(
    () => new Map(resources.map((r) => [r.id, r])),
    [resources],
  );
  const fixedById = useMemo(
    () => new Map(fixedServices.map((fs) => [fs.id, fs])),
    [fixedServices],
  );
  const supName = (id: number | null | undefined) =>
    suppliers.find((s) => s.id === id)?.name;

  // El costo COMPLETO del evento (personal incluido): es lo que viaja a
  // la rentabilidad por onCostChange.
  const total = useMemo(() => costoDelEvento(lines, personas), [lines, personas]);

  // Instanciación: servicios fijos del evento cuyos recursos aún no fueron
  // importados como líneas.
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
          !noCostIds?.has(fs.id),
      ),
    [fixedServices, itemsByService, noCostIds],
  );

  // Un evento de UN día no tiene nada que repartir: lo importado cae a
  // ese día solo. En uno de varios cae "sin día" y Felipe lo ubica.
  const esUnDia =
    !!eventDate && (!eventEndDate || iso(eventEndDate) === iso(eventDate));
  const diaUnico = esUnDia ? iso(eventDate) : null;

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
            day: diaUnico,
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

  // ---- Las filas de la grilla: un arriendo por fila ----
  const filas = useMemo(() => {
    const m = new Map<number, FilaArriendo>();
    for (const l of lines) {
      const r = resById.get(l.resource_id);
      // El personal vive en su propia grilla; las líneas huérfanas (su
      // catálogo se borró) se muestran acá para que no queden invisibles.
      if (r && r.type === "personal") continue;
      if (!m.has(l.resource_id)) {
        m.set(l.resource_id, {
          id: l.resource_id,
          nombre: r?.name || "Recurso eliminado",
          proveedor: supName(r?.supplier_id),
          auto: false,
          fijo: l.price_fixed || 0,
          pp: l.price_per_person || 0,
          porDia: new Map(),
          sinRepartir: [],
          lineas: [],
          huerfana: !r,
        });
      }
      const f = m.get(l.resource_id)!;
      f.lineas.push(l);
      if (l.origin_fixed_service_id) f.auto = true;
      f.pp = Math.max(f.pp, l.price_per_person || 0);
      const d = iso(l.day);
      if (d) f.porDia.set(d, l);
      else f.sinRepartir.push(l);
    }
    for (const id of nuevos) {
      if (m.has(id)) continue;
      const r = resById.get(id);
      if (!r) continue;
      m.set(id, {
        id,
        nombre: r.name,
        proveedor: supName(r.supplier_id),
        auto: false,
        fijo: Number(r.list_price_fixed) || 0,
        pp: Number(r.list_price_per_person) || 0,
        porDia: new Map(),
        sinRepartir: [],
        lineas: [],
        huerfana: false,
      });
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, resources, suppliers, nuevos]);

  const dias = useMemo(() => {
    const propios = eventDate
      ? diasEntre(iso(eventDate) as string, iso(eventEndDate))
      : [];
    const conLineas = filas.flatMap((f) => [...f.porDia.keys()]);
    return [...new Set([...propios, ...conLineas, ...extras])].sort();
  }, [eventDate, eventEndDate, filas, extras]);

  const diasDelEvento = useMemo(
    () =>
      new Set(
        eventDate ? diasEntre(iso(eventDate) as string, iso(eventEndDate)) : [],
      ),
    [eventDate, eventEndDate],
  );

  const unidadesDe = (f: FilaArriendo) =>
    [...f.porDia.values()].reduce((s, l) => s + (l.quantity || 0), 0) +
    f.sinRepartir.reduce((s, l) => s + (l.quantity || 0), 0);

  /** La fórmula de arriba, para UNA fila. */
  const subtotalDe = (f: FilaArriendo) => {
    const u = unidadesDe(f);
    if (f.pp > 0) return f.fijo + f.pp * personas * u;
    const porLineas = f.lineas.reduce(
      (s, l) => s + (l.price_fixed || 0) * (l.quantity || 0),
      0,
    );
    return porLineas || f.fijo * u;
  };

  const totalArriendos = filas.reduce((s, f) => s + subtotalDe(f), 0);

  const cambiarCantidad = async (
    f: FilaArriendo,
    d: string,
    cantidad: number,
  ) => {
    const linea = f.porDia.get(d);
    // Una línea con id negativo es optimista: aún no existe en el servidor.
    if (linea && linea.id < 0) return;
    const antes = linea?.quantity || 0;
    const sumando = cantidad > antes;
    const pool = sumando
      ? f.sinRepartir.find((l) => (l.quantity || 0) > 0)
      : undefined;
    setErr(null);

    // 1) La pantalla se mueve AL INSTANTE (parche optimista)…
    setLines((ls) => {
      let out = ls;
      if (linea) {
        out =
          cantidad <= 0
            ? out.filter((l) => l.id !== linea.id)
            : out.map((l) =>
                l.id === linea.id ? { ...l, quantity: cantidad } : l,
              );
      } else if (cantidad > 0) {
        out = [
          ...out,
          {
            id: -Math.floor(Math.random() * 1e9),
            quotation_id: quotationId,
            resource_id: f.id,
            quantity: cantidad,
            price_fixed: f.fijo,
            price_per_person: f.pp,
            origin_fixed_service_id: null,
            day: d,
          } as EventResource,
        ];
      }
      if (pool) {
        out =
          (pool.quantity || 0) > 1
            ? out.map((l) =>
                l.id === pool.id
                  ? { ...l, quantity: (l.quantity || 0) - 1 }
                  : l,
              )
            : out.filter((l) => l.id !== pool.id);
      }
      return out;
    });

    // 2) …y el servidor se pone al día atrás.
    try {
      if (linea && cantidad <= 0) {
        const { error } = await deleteEventResource(linea.id);
        if (error) throw error;
      } else if (linea) {
        const { error } = await updateEventResource(linea.id, {
          quantity: cantidad,
        });
        if (error) throw error;
      } else if (cantidad > 0) {
        const { error } = await addEventResource({
          company_id: companyId,
          quotation_id: quotationId,
          resource_id: f.id,
          quantity: cantidad,
          price_fixed: f.fijo,
          price_per_person: f.pp,
          day: d,
        });
        if (error) throw error;
      }
      // Al SUMAR, primero se MUEVE desde el contador "por ubicar".
      if (pool) {
        if ((pool.quantity || 0) > 1)
          await updateEventResource(pool.id, {
            quantity: (pool.quantity || 0) - 1,
          });
        else await deleteEventResource(pool.id);
      }
      flashSaved();
    } catch {
      setErr("No se pudo guardar");
    } finally {
      await sincronizarLineas();
    }
  };

  const cambiarPrecio = async (
    f: FilaArriendo,
    campo: "price_fixed" | "price_per_person",
    valor: number,
  ) => {
    for (const l of f.lineas) await saveLine(l.id, { [campo]: valor });
  };

  const eliminarFila = async (f: FilaArriendo) => {
    const ids = new Set(f.lineas.map((l) => l.id));
    setLines((ls) => ls.filter((l) => !ids.has(l.id)));
    setNuevos((a) => a.filter((x) => x !== f.id));
    setConfirmRowId(null);
    for (const l of f.lineas) await deleteEventResource(l.id);
    await sincronizarLineas();
  };

  const eliminarSinRepartir = async (f: FilaArriendo) => {
    const ids = new Set(f.sinRepartir.map((l) => l.id));
    setLines((ls) => ls.filter((l) => !ids.has(l.id)));
    for (const l of f.sinRepartir) await deleteEventResource(l.id);
    await sincronizarLineas();
  };

  const inicioEvento = iso(eventDate);
  const finEvento = iso(eventEndDate) || inicioEvento;
  const limiteAntes = inicioEvento ? sumarDias(inicioEvento, -TOPE_DIAS_EXTRA) : null;
  const limiteDespues = finEvento ? sumarDias(finEvento, TOPE_DIAS_EXTRA) : null;
  const puedeAntes =
    dias.length > 0 && !!limiteAntes && dias[0] > limiteAntes;
  const puedeDespues =
    dias.length > 0 && !!limiteDespues && dias[dias.length - 1] < limiteDespues;

  const agregarDia = (haciaAtras: boolean) => {
    if (haciaAtras ? !puedeAntes : !puedeDespues) return;
    const base = haciaAtras ? dias[0] : dias[dias.length - 1];
    setExtras((a) => [...a, sumarDias(base, haciaAtras ? -1 : 1)]);
  };

  const quitarDia = (d: string) => {
    const conCantidad = filas.some((f) => (f.porDia.get(d)?.quantity || 0) > 0);
    if (conCantidad) {
      setErr("Ese día tiene cantidades: primero déjalas en 0.");
      return;
    }
    setExtras((a) => a.filter((x) => x !== d));
  };

  const options = useMemo(() => {
    const enFilas = new Set(filas.map((f) => f.id));
    return [...resources]
      .filter(
        (r) =>
          r.is_active !== false && r.type !== "personal" && !enFilas.has(r.id),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({
        value: String(r.id),
        label: r.name,
        hint:
          [
            r.list_price_fixed ? clp(Number(r.list_price_fixed)) : null,
            r.list_price_per_person
              ? `${clp(Number(r.list_price_per_person))}/pers`
              : null,
            supName(r.supplier_id),
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources, filas, suppliers]);

  if (loading) {
    return (
      <div className="py-6 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2 min-h-[54px]">
        <Users size={17} className="text-gray-600" />
        <h4 className="text-base font-bold text-gray-900">
          Servicios externos
        </h4>
        {saved && (
          <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
            <Check size={13} /> Guardado
          </span>
        )}
        {err && (
          <span className="text-xs font-semibold text-red-600">{err}</span>
        )}
        {filas.length > 0 && !congelado && (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => agregarDia(true)}
              disabled={!puedeAntes}
              title={puedeAntes ? "Agregar un día antes" : "Máximo 4 días antes del evento"}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> día antes
            </button>
            <button
              type="button"
              onClick={() => agregarDia(false)}
              disabled={!puedeDespues}
              title={puedeDespues ? "Agregar un día después" : "Máximo 4 días después del evento"}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> día después
            </button>
          </div>
        )}
      </div>

      {/* Servicios fijos con recursos aún no importados */}
      {pendingServices.length > 0 && !congelado && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-800">
            <span className="font-bold">Con recursos por importar:</span>{" "}
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

      {/* La grilla solo existe cuando hay algo: "no llenamos
          innecesariamente la pantalla" (Felipe, 15-08). Es la pieza de la
          casa GrillaDeDias, la misma del Personal: anchos idénticos, así
          las columnas coinciden entre los dos bloques. */}
      {filas.length > 0 && (
        <GrillaDeDias
          dias={dias}
          diasFijos={diasDelEvento}
          congelado={congelado}
          onQuitarDia={quitarDia}
          columnaTitulo="Ítem"
          titulosValores={["Fijo", "Por pers.", "Subtotal"]}
          filas={filas.map((f): FilaGrillaDias => {
            const pendiente = f.sinRepartir.reduce(
              (s2, l) => s2 + (l.quantity || 0),
              0,
            );
            const origen = f.lineas
              .map((l) =>
                l.origin_fixed_service_id
                  ? fixedById.get(l.origin_fixed_service_id)?.nombre
                  : null,
              )
              .find(Boolean);
            return {
              id: f.id,
              masDeshabilitado: f.huerfana,
              titulo: (
                <>
                  <div className="text-gray-900">{f.nombre}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {f.proveedor && (
                      <span className="text-[11px] text-gray-400">
                        {f.proveedor}
                      </span>
                    )}
                    {f.auto && (
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700"
                        title={
                          origen
                            ? `importado del servicio fijo ${origen}`
                            : "importado de un servicio fijo"
                        }
                      >
                        auto
                      </span>
                    )}
                    {pendiente > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] text-amber-700"
                        title={`Este ítem trae ${pendiente} sin fecha. Al sumar con el + se van ubicando solos y este aviso desaparece. La ✕ descarta los que no vayas a usar.`}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        {pendiente} por ubicar en los días
                        {!congelado && (
                          <button
                            type="button"
                            onClick={() => eliminarSinRepartir(f)}
                            aria-label={`Descartar los ${pendiente} sin fecha de ${f.nombre}`}
                            title="Descartar los que quedan"
                            className="text-amber-700 hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                </>
              ),
              cantidadEn: (d) => f.porDia.get(d)?.quantity || 0,
              onCambiar: (d, nueva) => cambiarCantidad(f, d, nueva),
              valores: [
                <NumberInput
                  key="f"
                  value={f.fijo || undefined}
                  min={0}
                  currency
                  placeholder="0"
                  disabled={congelado || f.huerfana}
                  onCommit={(v) => {
                    const val = v || 0;
                    if (val !== f.fijo) cambiarPrecio(f, "price_fixed", val);
                  }}
                  className="w-24 px-2 py-1 text-sm text-right"
                  aria-label={`Precio fijo de ${f.nombre}`}
                />,
                <NumberInput
                  key="p"
                  value={f.pp || undefined}
                  min={0}
                  currency
                  placeholder="0"
                  disabled={congelado || f.huerfana}
                  onCommit={(v) => {
                    const val = v || 0;
                    if (val !== f.pp)
                      cambiarPrecio(f, "price_per_person", val);
                  }}
                  className="w-24 px-2 py-1 text-sm text-right"
                  aria-label={`Precio por persona de ${f.nombre}`}
                />,
                clp(subtotalDe(f)),
              ],
              accion:
                confirmRowId === f.id ? (
                  <ConfirmInline
                    question={`¿Quitar ${f.nombre}?`}
                    yesLabel="Quitar"
                    tono="peligro"
                    onYes={() => eliminarFila(f)}
                    onNo={() => setConfirmRowId(null)}
                  />
                ) : congelado ? undefined : (
                  <button
                    type="button"
                    onClick={() => setConfirmRowId(f.id)}
                    aria-label={`Quitar ${f.nombre}`}
                    className="p-1 text-gray-300 hover:text-red-600 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ),
            };
          })}
          pie={{
            etiqueta: "Total servicios externos",
            valores: [null, null, clp(totalArriendos)],
          }}
        />
      )}

      {!congelado && (
        <>
          <SelectWithSearch
            options={options}
            value=""
            onChange={(v) => {
              if (!v) return;
              setNuevos((a) => [...a, Number(v)]);
            }}
            placeholder="+ Agregar servicio externo…"
            searchPlaceholder="Buscar…"
            noResultsText="Sin resultados — los recursos se crean en Logística → Recursos"
          />
          {/* El crear-al-vuelo se eliminó (15-08, Felipe): "que se creen
              donde van", o sea en el catálogo de Logística → Recursos.
              Así el catálogo no se llena de duplicados apurados. */}

        </>
      )}
    </div>
  );
}
