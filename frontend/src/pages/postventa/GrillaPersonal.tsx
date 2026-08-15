import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarPlus, Users, X } from "lucide-react";
import GrillaDeDias, {
  type FilaGrillaDias,
} from "../../components/grilla/GrillaDeDias";
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
// La tabla es la pieza de la casa `GrillaDeDias`, compartida con los
// arriendos: mismos anchos, así las columnas coinciden entre bloques.
//
// Ver docs/arquitectura/10_MODULO_DE_PERSONAS.md

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
  const [preciosLocales, setPreciosLocales] = useState<Map<number, number>>(
    new Map(),
  );

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
        const { error } = await updateEventResource(p.linea.id, {
          quantity: p.cantidad,
        });
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

  const eliminarSinDia = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await deleteEventResource(id);
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
        const { error } = await updateEventResource(l.id, {
          price_fixed: p.precio,
        });
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
      {
        nombre: string;
        precio: number;
        porDia: Map<string, EventResource>;
        sinRepartir?: EventResource;
      }
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
      .filter(
        (r) =>
          r.type === "personal" && r.is_active !== false && !enFilas.has(r.id),
      )
      .map((r) => ({
        value: String(r.id),
        label: r.name,
        hint: r.list_price_fixed
          ? clp(Number(r.list_price_fixed))
          : "sin valor sugerido",
      }));
  }, [resources, filas]);

  const totalDe = (f: (typeof filas)[number]) =>
    [...f.porDia.values()].reduce((s, l) => s + (l.quantity || 0), 0) +
    (f.sinRepartir?.quantity || 0);

  const costoPersonal = filas.reduce((s, f) => s + totalDe(f) * f.precio, 0);

  const limiteAntes = sumarDias(eventDate, -TOPE_DIAS_EXTRA);
  const limiteDespues = sumarDias(iso(eventEndDate) || eventDate, TOPE_DIAS_EXTRA);
  const puedeAntes = dias.length > 0 && dias[0] > limiteAntes;
  const puedeDespues = dias.length > 0 && dias[dias.length - 1] < limiteDespues;

  const agregarDia = (haciaAtras: boolean) => {
    if (haciaAtras ? !puedeAntes : !puedeDespues) return;
    const base = haciaAtras ? dias[0] : dias[dias.length - 1];
    setExtras((a) => [...a, sumarDias(base, haciaAtras ? -1 : 1)]);
  };

  const quitarDia = (d: string) => {
    const conCantidad = filas.some((f) => (f.porDia.get(d)?.quantity || 0) > 0);
    if (conCantidad) {
      toast.error(
        "Ese día tiene gente asignada: primero deja sus cantidades en 0.",
      );
      return;
    }
    setExtras((a) => a.filter((x) => x !== d));
  };

  // ---- Adaptación a la pieza de la casa ----
  const filasGrilla: FilaGrillaDias[] = filas.map((f) => {
    const total = totalDe(f);
    const pendiente = f.sinRepartir?.quantity || 0;
    const lineasDelCargo = [
      ...f.porDia.values(),
      ...(f.sinRepartir ? [f.sinRepartir] : []),
    ];
    return {
      id: f.id,
      titulo: (
        <>
          {f.nombre}
          {pendiente > 0 && (
            <span
              className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-700"
              title={`Este cargo traía ${pendiente} sin fecha (de antes de que la grilla tuviera días). Ponlos en los días con el + y después borra este aviso con la ✕.`}
            >
              <AlertTriangle className="w-3 h-3" />
              {pendiente} por ubicar en los días
              {!congelado && f.sinRepartir && (
                <button
                  type="button"
                  onClick={() => eliminarSinDia.mutate(f.sinRepartir!.id)}
                  aria-label={`Descartar los sin fecha de ${f.nombre}`}
                  title="Ya los ubiqué: borrar este aviso"
                  className="text-amber-700 hover:text-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          )}
        </>
      ),
      cantidadEn: (d) => f.porDia.get(d)?.quantity || 0,
      onCambiar: (d, nueva) =>
        guardar.mutate({
          resourceId: f.id,
          day: d,
          cantidad: nueva,
          linea: f.porDia.get(d),
          precio: f.precio,
        }),
      valores: [
        <span key="t" className="font-medium text-gray-900">
          {total}
        </span>,
        <NumberInput
          key="v"
          value={f.precio || undefined}
          min={0}
          currency
          placeholder="0"
          disabled={congelado}
          onCommit={(v) => {
            const precio = v || 0;
            if (precio === f.precio) return;
            setPreciosLocales((m) => new Map(m).set(f.id, precio));
            if (lineasDelCargo.length > 0)
              cambiarValor.mutate({ lineas: lineasDelCargo, precio });
          }}
          className="w-24 px-2 py-1 text-sm text-right"
          aria-label={`Valor de ${f.nombre}`}
        />,
        clp(total * f.precio),
      ],
    };
  });

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
              disabled={!puedeAntes}
              title={puedeAntes ? "Agregar un día antes (preparativos)" : "Máximo 4 días antes del evento"}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> día antes
            </button>
            <button
              type="button"
              onClick={() => agregarDia(false)}
              disabled={!puedeDespues}
              title={puedeDespues ? "Agregar un día después (desarme)" : "Máximo 4 días después del evento"}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
        <GrillaDeDias
          dias={dias}
          diasFijos={diasDelEvento}
          congelado={congelado}
          onQuitarDia={quitarDia}
          columnaTitulo="Cargo"
          titulosValores={["Total", "Valor c/u", "Subtotal"]}
          filas={filasGrilla}
          pie={{
            etiqueta: "Jornadas del día",
            porDia: (d) => {
              const n = filas.reduce(
                (s, f) => s + (f.porDia.get(d)?.quantity || 0),
                0,
              );
              return n > 0 ? n : "·";
            },
            valores: [
              filas.reduce((s, f) => s + totalDe(f), 0),
              null,
              clp(costoPersonal),
            ],
          }}
        />
      )}
    </div>
  );
}
