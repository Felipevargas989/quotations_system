import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarPlus, Minus, Plus } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import {
  addEventResource,
  deleteEventResource,
  updateEventResource,
  type EventResource,
} from "../../services/logistics.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { recursosQueryOpts } from "./EventResourcesSection";

// LA GRILLA DE DÍAS
//
// Días en las columnas, cargos en las filas. La arquitectura completa está
// en 00_DOCUMENTACION/10_MODULO_DE_PERSONAS.md — LÉELA antes de tocar esto.
//
// POR QUÉ EXISTE, en palabras de Felipe: "se necesitan diez personas, pero
// NO diez personas el mismo día". La cantidad de una línea SIEMPRE fue el
// total del evento; lo que faltaba era poder repartirla.
//
// Y está medido en su Excel: Joker No 1 duró 6 días, pasaron 10 personas y
// NADIE trabajó los 6 días — el día 4 hubo un relevo casi completo.
//
// REPARTIR NO CAMBIA EL COSTO. El total es la suma de los días, y el
// cálculo del costo ya sumaba cantidad × precio por línea. Por eso esta
// pantalla no toca ningún número de plata: solo dice cuándo va cada uno.
//
// Un evento de 15 días es esta misma pantalla con 15 columnas.

const DIA_MS = 86_400_000;

/** Los días entre dos fechas, ambas incluidas. Sin fecha de término, el
 *  evento dura UN día — regla de Felipe, y en producción solo 18 de 387
 *  cotizaciones tienen término. */
const diasEntre = (desde: string, hasta: string | null): string[] => {
  const ini = new Date(`${desde}T00:00:00Z`).getTime();
  const fin = new Date(`${hasta || desde}T00:00:00Z`).getTime();
  if (isNaN(ini) || isNaN(fin) || fin < ini) return [desde];
  const dias: string[] = [];
  for (let t = ini; t <= fin; t += DIA_MS) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
};

const rotulo = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const dia = d.toLocaleDateString("es-CL", { weekday: "short", timeZone: "UTC" });
  const num = d.getUTCDate();
  const mes = d.toLocaleDateString("es-CL", { month: "short", timeZone: "UTC" });
  return { dia: dia.replace(".", ""), num, mes: mes.replace(".", "") };
};

interface Props {
  readonly companyId: number;
  readonly quotationId: string;
  readonly eventDate: string;
  readonly eventEndDate: string | null;
  readonly congelado?: boolean;
}

export default function GrillaDeDias({
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

  // Los días del evento, más los que se agreguen a mano (preparativos,
  // desarme). En el correo real de la administradora aparece
  // "Preparativos evento Municipalidad, $25.000": un día de trabajo ANTES
  // del evento, que hoy no está en ninguna parte del costo.
  const dias = useMemo(() => {
    const propios = diasEntre(eventDate, eventEndDate);
    return [...new Set([...propios, ...extras])].sort();
  }, [eventDate, eventEndDate, extras]);

  // Solo personal: el arriendo también lleva día, pero su grilla es otra
  // conversación (un toldo no se reparte, se ocupa N días seguidos).
  const filas = useMemo(() => {
    const porRecurso = new Map<
      number,
      { nombre: string; precio: number; porDia: Map<string, EventResource>; sinRepartir?: EventResource }
    >();
    for (const l of lines) {
      const r = resources.find((x) => x.id === l.resource_id);
      if (!r || r.type !== "personal") continue;
      if (!porRecurso.has(l.resource_id)) {
        porRecurso.set(l.resource_id, {
          nombre: r.name,
          precio: l.price_fixed || Number(r.list_price_fixed) || 0,
          porDia: new Map(),
        });
      }
      const f = porRecurso.get(l.resource_id)!;
      if (l.day) f.porDia.set(l.day.slice(0, 10), l);
      else f.sinRepartir = l;
    }
    return [...porRecurso.entries()].map(([id, f]) => ({ id, ...f }));
  }, [lines, resources]);

  if (filas.length === 0) return null;

  const totalDe = (f: (typeof filas)[number]) =>
    [...f.porDia.values()].reduce((s, l) => s + (l.quantity || 0), 0);

  const agregarDia = (haciaAtras: boolean) => {
    const base = haciaAtras ? dias[0] : dias[dias.length - 1];
    const t = new Date(`${base}T00:00:00Z`).getTime() + (haciaAtras ? -DIA_MS : DIA_MS);
    setExtras((a) => [...a, new Date(t).toISOString().slice(0, 10)]);
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Quién va cada día</h3>
          <p className="text-xs text-gray-500">
            La cantidad es el total del evento. Repartirla no cambia el costo.
          </p>
        </div>
        {!congelado && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => agregarDia(true)}
              title="Agregar un día antes (preparativos)"
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-white"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> antes
            </button>
            <button
              type="button"
              onClick={() => agregarDia(false)}
              title="Agregar un día después (desarme)"
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-white"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> después
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white border-b border-gray-200">
              <th className="px-3 py-2 text-left font-medium text-gray-500 sticky left-0 bg-white">
                Cargo
              </th>
              {dias.map((d) => {
                const r = rotulo(d);
                return (
                  <th key={d} className="px-2 py-2 text-center font-medium text-gray-600 min-w-[4.5rem]">
                    <div className="text-[11px] text-gray-400 leading-none">{r.dia}</div>
                    <div className="leading-tight">{r.num}</div>
                    <div className="text-[11px] text-gray-400 leading-none">{r.mes}</div>
                  </th>
                );
              })}
              <th className="px-3 py-2 text-right font-medium text-gray-500">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map((f) => {
              const repartido = totalDe(f);
              const pendiente = f.sinRepartir?.quantity || 0;
              return (
                <tr key={f.id}>
                  <td className="px-3 py-2 text-gray-900 sticky left-0 bg-white">
                    {f.nombre}
                    {pendiente > 0 && (
                      <span
                        className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-700"
                        title="Esta cantidad todavía no se reparte entre los días"
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
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">
                    {repartido + pendiente}
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
                const n = filas.reduce(
                  (s, f) => s + (f.porDia.get(d)?.quantity || 0),
                  0,
                );
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
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">
                {filas.reduce((s, f) => s + totalDe(f) + (f.sinRepartir?.quantity || 0), 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
