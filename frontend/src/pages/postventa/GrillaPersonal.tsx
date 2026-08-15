import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarPlus, Minus, Plus, Users, X } from "lucide-react";
import { NumberInput } from "../../components/inputs";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import type { SelectOption } from "../../components/selects/types";
import { toast } from "../../components/toast/Toast";
import {
  addEventResource,
  deleteEventResource,
  updateEventResource,
  type EventResource,
} from "../../services/logistics.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { recursosQueryOpts } from "./EventResourcesSection";

// EL PERSONAL DEL EVENTO — LA PLANIFICACIÓN PRELIMINAR, SIN NOMBRES
//
// Días en las columnas, cargos en las filas, cantidades en las casillas.
// Acá se decide QUÉ equipo necesita el evento y CUÁNTO cuesta: agregar
// cargos, agregar o quitar días, y ponerle el valor a cada cargo.
//
// Los NOMBRES no van acá: van en Personas → Semana, porque conseguir
// gente es una tarea de la semana, no de un evento. Esta grilla es la que
// alimenta esa planificación.
//
// La cantidad de una línea siempre fue el total del evento ("se necesitan
// diez personas, pero NO diez personas el mismo día"): acá vive repartida
// por día, y el costo es la suma — cantidad × valor, día por día.
//
// Ver docs/arquitectura/10_MODULO_DE_PERSONAS.md

const DIA_MS = 86_400_000;

const diasEntre = (desde: string, hasta: string | null): string[] => {
  const ini = new Date(`${desde}T00:00:00Z`).getTime();
  const fin = new Date(`${hasta || desde}T00:00:00Z`).getTime();
  if (isNaN(ini) || isNaN(fin) || fin < ini) return [desde];
  const out: string[] = [];
  for (let t = ini; t <= fin; t += DIA_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

const rotulo = (isoDia: string) => {
  const d = new Date(`${isoDia}T12:00:00Z`);
  return {
    dia: d.toLocaleDateString("es-CL", { weekday: "short", timeZone: "UTC" }).replace(".", ""),
    num: d.getUTCDate(),
    mes: d.toLocaleDateString("es-CL", { month: "short", timeZone: "UTC" }).replace(".", ""),
  };
};

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");
const iso = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);

interface Props {
  readonly companyId: number;
  readonly quotationId: string;
  readonly eventDate: string;
  readonly eventEndDate: string | null;
  readonly congelado?: boolean;
}

export default function GrillaPersonal({
  companyId,
  quotationId,
  eventDate,
  eventEndDate,
  congelado = false,
}: Props) {
  const qc = useQueryClient();
  const opts = recursosQueryOpts(companyId, quotationId);
  const { data } = useQuery(opts);
  const [extras, setExtras] = useState<string[]>([]);
  // Cargos agregados que todavía no tienen ninguna cantidad puesta: viven
  // acá hasta que el primer + cree su primera línea.
  const [cargosNuevos, setCargosNuevos] = useState<number[]>([]);
  // El valor elegido a mano para un cargo sin líneas todavía.
  const [preciosLocales, setPreciosLocales] = useState<Map<number, number>>(new Map());

  const lines = data?.lines ?? [];
  const resources = data?.resources ?? [];

  const refrescar = () => qc.invalidateQueries({ queryKey: opts.queryKey });

  const guardar = useMutation({
    mutationFn: async (p: {
      resourceId: number;
      day: string;
      cantidad: number;
      linea?: EventResource;
      precio: number;
    }) => {
      if (p.linea && p.cantidad <= 0) {
        const { error } = await deleteEventResource(p.linea.id);
        if (error) throw error;
        return;
      }
      if (p.linea) {
        const { error } = await updateEventResource(p.linea.id, { quantity: p.cantidad });
        if (error) throw error;
        return;
      }
      if (p.cantidad <= 0) return;
      const { error } = await addEventResource({
        company_id: companyId,
        quotation_id: quotationId,
        resource_id: p.resourceId,
        quantity: p.cantidad,
        price_fixed: p.precio,
        price_per_person: 0,
        day: p.day,
      });
      if (error) throw error;
    },
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  // Cambiar el valor de un cargo toca TODAS sus líneas: el valor es del
  // cargo en este evento, no de un día suelto.
  const cambiarValor = useMutation({
    mutationFn: async (p: { lineas: EventResource[]; precio: number }) => {
      for (const l of p.lineas) {
        const { error } = await updateEventResource(l.id, { price_fixed: p.precio });
        if (error) throw error;
      }
    },
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  // Filas: los cargos con líneas, más los recién agregados sin cantidad.
  const filas = useMemo(() => {
    const m = new Map<
      number,
      { nombre: string; precio: number; porDia: Map<string, EventResource>; sinRepartir?: EventResource }
    >();
    for (const l of lines) {
      const r = resources.find((x) => x.id === l.resource_id);
      if (!r || r.type !== "personal") continue;
      if (!m.has(r.id)) {
        m.set(r.id, {
          nombre: r.name,
          precio: l.price_fixed || Number(r.list_price_fixed) || 0,
          porDia: new Map(),
        });
      }
      const f = m.get(r.id)!;
      const d = iso(l.day);
      if (d) f.porDia.set(d, l);
      else f.sinRepartir = l;
    }
    for (const id of cargosNuevos) {
      if (m.has(id)) continue;
      const r = resources.find((x) => x.id === id);
      if (!r) continue;
      m.set(id, {
        nombre: r.name,
        precio: preciosLocales.get(id) ?? Number(r.list_price_fixed) ?? 0,
        porDia: new Map(),
      });
    }
    return [...m.entries()].map(([id, f]) => ({
      id,
      ...f,
      precio: preciosLocales.get(id) ?? f.precio,
    }));
  }, [lines, resources, cargosNuevos, preciosLocales]);

  // Los días: los del evento, los que tienen líneas y los agregados a mano.
  const dias = useMemo(() => {
    const propios = diasEntre(eventDate, eventEndDate);
    const conLineas = filas.flatMap((f) => [...f.porDia.keys()]);
    return [...new Set([...propios, ...conLineas, ...extras])].sort();
  }, [eventDate, eventEndDate, extras, filas]);

  const diasDelEvento = useMemo(
    () => new Set(diasEntre(eventDate, eventEndDate)),
    [eventDate, eventEndDate],
  );

  const cargosDisponibles: SelectOption[] = useMemo(() => {
    const enFilas = new Set(filas.map((f) => f.id));
    return resources
      .filter((r) => r.type === "personal" && r.is_active !== false && !enFilas.has(r.id))
      .map((r) => ({
        value: String(r.id),
        label: r.name,
        hint: r.list_price_fixed ? clp(Number(r.list_price_fixed)) : "sin valor sugerido",
      }));
  }, [resources, filas]);

  const totalDe = (f: (typeof filas)[number]) =>
    [...f.porDia.values()].reduce((s, l) => s + (l.quantity || 0), 0) +
    (f.sinRepartir?.quantity || 0);

  const costoPersonal = filas.reduce((s, f) => s + totalDe(f) * f.precio, 0);

  const agregarDia = (haciaAtras: boolean) => {
    const base = haciaAtras ? dias[0] : dias[dias.length - 1];
    const t = new Date(`${base}T00:00:00Z`).getTime() + (haciaAtras ? -DIA_MS : DIA_MS);
    setExtras((a) => [...a, new Date(t).toISOString().slice(0, 10)]);
  };

  const quitarDia = (d: string) => {
    const conCantidad = filas.some((f) => (f.porDia.get(d)?.quantity || 0) > 0);
    if (conCantidad) {
      toast.error("Ese día tiene gente asignada: primero deja sus cantidades en 0.");
      return;
    }
    setExtras((a) => a.filter((x) => x !== d));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2 min-h-[54px]">
        <Users size={17} className="text-gray-600" />
        <h4 className="text-base font-bold text-gray-900">Personal</h4>
        <span className="text-xs text-gray-400">
          cuántos necesito cada día, y a qué valor
        </span>
        <Link
          to="/personas"
          className="ml-auto text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          Poner nombres →
        </Link>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-64">
          <SelectWithSearch
            options={cargosDisponibles}
            value=""
            onChange={(v) => {
              if (!v) return;
              setCargosNuevos((a) => [...a, Number(v)]);
            }}
            placeholder="+ Agregar cargo"
            searchPlaceholder="Buscar cargo…"
            disabled={congelado}
            tamano="sm"
            mostrarConteo={false}
          />
        </div>
        {!congelado && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => agregarDia(true)}
              title="Agregar un día antes (preparativos)"
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> día antes
            </button>
            <button
              type="button"
              onClick={() => agregarDia(false)}
              title="Agregar un día después (desarme)"
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> día después
            </button>
          </div>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">
          Agrega los cargos que este evento necesita — garzones, cocina, lo
          que sea — y reparte cuántos van cada día.
        </p>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left font-medium text-gray-500 sticky left-0 bg-gray-50">
                  Cargo
                </th>
                {dias.map((d) => {
                  const r = rotulo(d);
                  const esExtra = !diasDelEvento.has(d);
                  return (
                    <th key={d} className="px-2 py-2 text-center font-medium text-gray-600 min-w-[4.5rem]">
                      <div className="text-[11px] text-gray-400 leading-none">{r.dia}</div>
                      <div className="leading-tight">
                        {r.num}
                        {esExtra && !congelado && (
                          <button
                            type="button"
                            onClick={() => quitarDia(d)}
                            aria-label={`Quitar el día ${d}`}
                            title="Quitar este día agregado"
                            className="ml-1 text-gray-300 hover:text-red-600 align-middle"
                          >
                            <X className="w-3 h-3 inline" />
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 leading-none">{r.mes}</div>
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-right font-medium text-gray-500 w-16">Total</th>
                <th className="px-2 py-2 text-right font-medium text-gray-500 w-28">Valor c/u</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500 w-28">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.map((f) => {
                const total = totalDe(f);
                const pendiente = f.sinRepartir?.quantity || 0;
                const lineasDelCargo = [
                  ...f.porDia.values(),
                  ...(f.sinRepartir ? [f.sinRepartir] : []),
                ];
                return (
                  <tr key={f.id}>
                    <td className="px-3 py-2 text-gray-900 sticky left-0 bg-white">
                      {f.nombre}
                      {pendiente > 0 && (
                        <span
                          className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-700"
                          title="Esta cantidad viene de antes y no dice qué día: repártela con los + de cada día y luego déjala en 0"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          {pendiente} sin repartir
                        </span>
                      )}
                    </td>
                    {dias.map((d) => {
                      const linea = f.porDia.get(d);
                      const cant = linea?.quantity || 0;
                      return (
                        <td key={d} className="px-1 py-1 text-center">
                          <div className="inline-flex items-center gap-0.5">
                            <button
                              type="button"
                              disabled={congelado || cant <= 0}
                              onClick={() =>
                                guardar.mutate({
                                  resourceId: f.id,
                                  day: d,
                                  cantidad: cant - 1,
                                  linea,
                                  precio: f.precio,
                                })
                              }
                              aria-label={`Uno menos de ${f.nombre} el ${d}`}
                              className="p-0.5 text-gray-300 hover:text-red-600 disabled:opacity-30"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span
                              className={`w-6 text-center tabular-nums ${
                                cant > 0 ? "text-gray-900 font-medium" : "text-gray-300"
                              }`}
                            >
                              {cant > 0 ? cant : "·"}
                            </span>
                            <button
                              type="button"
                              disabled={congelado}
                              onClick={() =>
                                guardar.mutate({
                                  resourceId: f.id,
                                  day: d,
                                  cantidad: cant + 1,
                                  linea,
                                  precio: f.precio,
                                })
                              }
                              aria-label={`Uno más de ${f.nombre} el ${d}`}
                              className="p-0.5 text-gray-300 hover:text-blue-600 disabled:opacity-30"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right tabular-nums font-medium text-gray-900">
                      {total}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <NumberInput
                        value={f.precio || undefined}
                        min={0}
                        currency
                        placeholder="0"
                        onCommit={(v) => {
                          const precio = v || 0;
                          if (precio === f.precio) return;
                          setPreciosLocales((m) => new Map(m).set(f.id, precio));
                          if (lineasDelCargo.length > 0)
                            cambiarValor.mutate({ lineas: lineasDelCargo, precio });
                        }}
                        className="w-24 px-2 py-1 text-sm text-right"
                        aria-label={`Valor de ${f.nombre}`}
                        disabled={congelado}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                      {clp(total * f.precio)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-3 py-2 text-gray-500 sticky left-0 bg-gray-50">
                  Jornadas del día
                </td>
                {dias.map((d) => {
                  const n = filas.reduce((s, f) => s + (f.porDia.get(d)?.quantity || 0), 0);
                  return (
                    <td
                      key={d}
                      className={`px-2 py-2 text-center tabular-nums ${
                        n > 0 ? "text-gray-900 font-semibold" : "text-gray-300"
                      }`}
                    >
                      {n > 0 ? n : "·"}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-right tabular-nums font-semibold text-gray-900">
                  {filas.reduce((s, f) => s + totalDe(f), 0)}
                </td>
                <td />
                <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900">
                  {clp(costoPersonal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
