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
  addStaff,
  getStaff,
  removeStaff,
  updateStaff,
} from "../../services/people.service";
import type { Asignacion } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { recursosQueryOpts } from "./EventResourcesSection";

// EL PERSONAL DEL EVENTO — LAS SILLAS (migración 84)
//
// Diseño de Felipe (17-08): la venta pone las sillas — "voy a necesitar
// tres garzones el 23, a $27.000" — y Planificación les pone nombre.
// UNA tabla para el plan y la realidad: esta grilla cuenta sillas por
// cargo y día; quién se sienta se ve en Personas → Planificación.
//
// El costo es UNO, por construcción: sillas con nombre al monto
// acordado, vacías al valor estimado. Y cuando todas las sillas tienen
// nombre confirmado, la sección se apaga: el valor c/u pasa a ser el
// promedio real, en gris, y se mira — no se toca. Si Planificación
// después agrega una silla, acá solo se refleja.
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
  // El catálogo de cargos (nombres y valores sugeridos) sigue viniendo
  // de recursos; las SILLAS viven en event_staff.
  const { data } = useQuery(recursosQueryOpts(companyId, quotationId));
  const resources = data?.resources ?? [];

  const staffKey = ["people", "staff-evento", quotationId];
  const { data: sillas = [] } = useQuery({
    queryKey: staffKey,
    queryFn: () => getStaff(quotationId),
  });

  const [extras, setExtras] = useState<string[]>([]);
  // Cargos agregados que todavía no tienen ninguna silla: viven acá
  // hasta que el primer + cree la primera.
  const [cargosNuevos, setCargosNuevos] = useState<number[]>([]);
  // El valor elegido a mano para las sillas nuevas de un cargo.
  const [preciosLocales, setPreciosLocales] = useState<Map<number, number>>(
    new Map(),
  );

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: staffKey });
  };

  // ---- Las filas: un cargo, sus sillas por día ----
  const filas = useMemo(() => {
    const m = new Map<
      number,
      {
        nombre: string;
        porDia: Map<string, Asignacion[]>;
        sinDia: Asignacion[];
        todas: Asignacion[];
      }
    >();
    for (const a of sillas) {
      const rid = a.role_id ?? 0;
      if (!m.has(rid)) {
        m.set(rid, {
          nombre:
            a.management_resources?.name ??
            resources.find((r) => r.id === rid)?.name ??
            "Sin cargo",
          porDia: new Map(),
          sinDia: [],
          todas: [],
        });
      }
      const f = m.get(rid)!;
      f.todas.push(a);
      const d = iso(a.day);
      if (d) f.porDia.set(d, [...(f.porDia.get(d) ?? []), a]);
      else f.sinDia.push(a);
    }
    for (const id of cargosNuevos) {
      if (m.has(id)) continue;
      const r = resources.find((x) => x.id === id);
      if (!r) continue;
      m.set(id, { nombre: r.name, porDia: new Map(), sinDia: [], todas: [] });
    }
    return [...m.entries()].map(([id, f]) => ({ id, ...f }));
  }, [sillas, resources, cargosNuevos]);

  /** El valor con que nacen las sillas nuevas de un cargo. */
  const valorDe = (f: (typeof filas)[number]) =>
    preciosLocales.get(f.id) ??
    Number(
      f.todas.find((s) => s.person_id == null)?.amount ??
        f.todas[0]?.amount ??
        resources.find((r) => r.id === f.id)?.list_price_fixed,
    ) ??
    0;

  const plataDe = (f: (typeof filas)[number]) =>
    f.todas.reduce((s, a) => s + Number(a.amount ?? 0), 0);

  const costoPersonal = filas.reduce((s, f) => s + plataDe(f), 0);

  // EL GRIS DE FELIPE (17-08): confirmado el último, la sección se
  // apaga — cantidad, días y valor de solo lectura, y el valor c/u pasa
  // a ser el promedio real. Es dinámico: si Planificación suma una
  // silla, esto se vuelve a encender solo.
  const todoConfirmado =
    sillas.length > 0 &&
    sillas.every((s) => s.person_id != null && s.status === "confirmado");
  const soloLectura = congelado || todoConfirmado;

  // ---- Los días: los del evento, los con sillas y los agregados ----
  const dias = useMemo(() => {
    const propios = diasEntre(eventDate, eventEndDate);
    const conSillas = filas.flatMap((f) => [...f.porDia.keys()]);
    return [...new Set([...propios, ...conSillas, ...extras])].sort();
  }, [eventDate, eventEndDate, extras, filas]);

  const diasDelEvento = useMemo(
    () => new Set(diasEntre(eventDate, eventEndDate)),
    [eventDate, eventEndDate],
  );

  const primerDia = dias[0];
  const ultimoDia = dias[dias.length - 1];
  const puedeAntes =
    primerDia > sumarDias(diasEntre(eventDate, eventEndDate)[0], -TOPE_DIAS_EXTRA);
  const propiosDelEvento = diasEntre(eventDate, eventEndDate);
  const finEvento = propiosDelEvento[propiosDelEvento.length - 1] ?? eventDate;
  const puedeDespues = ultimoDia < sumarDias(finEvento, TOPE_DIAS_EXTRA);

  const agregarDia = (antes: boolean) =>
    setExtras((a) => [
      ...a,
      antes ? sumarDias(primerDia, -1) : sumarDias(ultimoDia, 1),
    ]);

  const cantidadDelDia = (f: (typeof filas)[number], d: string) =>
    (f.porDia.get(d) ?? []).length;

  const quitarDia = (d: string) => {
    const conSillas = filas.some((f) => cantidadDelDia(f, d) > 0);
    if (conSillas) {
      toast.error("Ese día tiene sillas: primero déjalo en 0.");
      return;
    }
    setExtras((a) => a.filter((x) => x !== d));
  };

  const cargosDisponibles: SelectOption[] = useMemo(() => {
    const enFilas = new Set(filas.map((f) => f.id));
    return resources
      .filter((r) => r.type === "personal" && r.is_active !== false)
      .filter((r) => !enFilas.has(r.id))
      .map((r) => ({
        value: String(r.id),
        label: r.name,
        hint: Number(r.list_price_fixed)
          ? clp(Number(r.list_price_fixed))
          : "sin valor sugerido",
      }));
  }, [resources, filas]);

  // ---- Los cambios: sillas que nacen, se mueven o se van ----
  const cambiar = useMutation({
    mutationFn: async (p: {
      fila: (typeof filas)[number];
      day: string;
      nueva: number;
    }) => {
      const delDia = p.fila.porDia.get(p.day) ?? [];
      // Una silla con id negativo es optimista: todavía no existe en el
      // servidor. El clic siguiente llega tras la sincronización.
      if (delDia.some((s) => s.id < 0) || p.fila.sinDia.some((s) => s.id < 0))
        return;
      if (p.nueva > delDia.length) {
        // Primero se ubica una silla "sin día": el aviso baja solo
        // (Felipe, 15-08). Si no queda, nace una silla nueva.
        const sinDia = p.fila.sinDia[0];
        if (sinDia) {
          await updateStaff(sinDia.id, { day: p.day });
        } else {
          await addStaff({
            quotation_id: quotationId,
            role_id: p.fila.id || null,
            day: p.day,
            amount: valorDe(p.fila) || null,
          });
        }
      } else if (p.nueva < delDia.length) {
        // Se quita una silla VACÍA. Las con nombre se sacan en
        // Planificación: acá no se despide a nadie.
        const vacia = delDia.find((s) => s.person_id == null);
        if (!vacia) {
          throw new Error(
            "Los de ese día tienen nombre: sácalos en Personas → Planificación.",
          );
        }
        await removeStaff(vacia.id);
      }
    },
    // LA CLAVE DE LA VELOCIDAD (15-08, "la navegabilidad es lenta"; y
    // otra vez el 17-08 cuando la reescritura la perdió): la pantalla se
    // mueve AL INSTANTE con un parche optimista, y recién después se
    // reconcilia con lo que diga el servidor. Sin esto, cada clic
    // espera el viaje de ida y vuelta.
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: staffKey });
      const previo = qc.getQueryData<Asignacion[]>(staffKey);
      qc.setQueryData<Asignacion[]>(staffKey, (old = []) => {
        const delDia = p.fila.porDia.get(p.day) ?? [];
        if (p.nueva > delDia.length) {
          const sinDia = p.fila.sinDia[0];
          if (sinDia) {
            return old.map((s) =>
              s.id === sinDia.id ? { ...s, day: p.day } : s,
            );
          }
          return [
            ...old,
            {
              id: -Math.floor(Math.random() * 1e9),
              quotation_id: quotationId,
              person_id: null,
              day: p.day,
              role_id: p.fila.id || null,
              kind: "freelance",
              status: "por_confirmar",
              amount: valorDe(p.fila) || null,
              starts_at: null,
              ends_at: null,
              break_minutes: null,
            } as unknown as Asignacion,
          ];
        }
        if (p.nueva < delDia.length) {
          const vacia = delDia.find((s) => s.person_id == null);
          return vacia ? old.filter((s) => s.id !== vacia.id) : old;
        }
        return old;
      });
      return { previo };
    },
    // Reconciliar con los ids reales del servidor: una sola consulta.
    onSettled: refrescar,
    onError: (e: unknown, _p, ctx) => {
      if (ctx?.previo) qc.setQueryData(staffKey, ctx.previo);
      toast.error(e instanceof Error ? e.message : humanizeApiError(e));
    },
  });

  // Cambiar el valor de un cargo toca sus sillas VACÍAS: las con nombre
  // tienen su monto acordado y nadie se lo pisa por detrás.
  const cambiarValor = useMutation({
    mutationFn: async (p: { fila: (typeof filas)[number]; precio: number }) => {
      for (const s of p.fila.todas) {
        if (s.person_id != null) continue;
        await updateStaff(s.id, { amount: p.precio });
      }
    },
    onSettled: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const descartarSinDia = useMutation({
    mutationFn: async (fila: (typeof filas)[number]) => {
      for (const s of fila.sinDia) {
        if (s.person_id != null) continue;
        await removeStaff(s.id);
      }
    },
    onSettled: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  // ---- Adaptación a la pieza de la casa ----
  const filasGrilla: FilaGrillaDias[] = filas.map((f) => {
    const total = f.todas.length;
    const pendientes = f.sinDia.filter((s) => s.person_id == null).length;
    const sinNombre = f.todas.filter((s) => s.person_id == null).length;
    return {
      id: f.id,
      titulo: (
        <>
          {f.nombre}
          {pendientes > 0 && (
            <span
              className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-700"
              title={`Este cargo trae ${pendientes} sin fecha. Al sumar con el + se van ubicando solos y este aviso desaparece. La ✕ descarta los que no vayas a usar.`}
            >
              <AlertTriangle className="w-3 h-3" />
              {pendientes} por ubicar en los días
              {!soloLectura && (
                <button
                  type="button"
                  onClick={() => descartarSinDia.mutate(f)}
                  aria-label={`Descartar los sin fecha de ${f.nombre}`}
                  title="Descartar los que quedan"
                  className="text-amber-700 hover:text-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          )}
          {total > 0 && sinNombre > 0 && (
            <span
              className="ml-2 text-[11px] text-gray-400"
              title="Sillas sin nombre todavía: se sientan en Personas → Planificación"
            >
              {total - sinNombre} de {total} con nombre
            </span>
          )}
        </>
      ),
      cantidadEn: (d) => cantidadDelDia(f, d),
      masDeshabilitado: soloLectura,
      onCambiar: (d, nueva) => {
        if (soloLectura) return;
        cambiar.mutate({ fila: f, day: d, nueva });
      },
      valores: [
        <span key="t" className="font-medium text-gray-900">
          {total}
        </span>,
        soloLectura ? (
          // El promedio REAL pagado, en gris: la propuesta de Felipe
          // para cuando cada silla tiene su monto y un solo "valor c/u"
          // ya no existe.
          <span
            key="v"
            className="text-gray-400 tabular-nums"
            title="Promedio real por silla — el detalle vive en Planificación"
          >
            {total > 0 ? clp(plataDe(f) / total) : "—"}
          </span>
        ) : (
          <NumberInput
            key="v"
            value={valorDe(f) || undefined}
            min={0}
            onCommit={(v: number | undefined) => {
              const precio = v ?? 0;
              setPreciosLocales((m) => new Map(m).set(f.id, precio));
              if (f.todas.some((s) => s.person_id == null)) {
                cambiarValor.mutate({ fila: f, precio });
              }
            }}
            placeholder="valor"
            aria-label={`Valor por jornada de ${f.nombre}`}
            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
          />
        ),
        <span key="s" className="tabular-nums">
          {clp(plataDe(f))}
        </span>,
      ],
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2 min-h-[54px]">
        <Users size={17} className="text-gray-600" />
        <h4 className="text-base font-bold text-gray-900">Personal</h4>
        <span className="text-xs text-gray-400">
          {todoConfirmado
            ? "equipo confirmado — el detalle vive en Planificación"
            : "cuántos necesito cada día, y a qué valor"}
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
            disabled={soloLectura}
            tamano="sm"
            mostrarConteo={false}
          />
        </div>
        {!soloLectura && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => agregarDia(true)}
              disabled={!puedeAntes}
              title={
                puedeAntes
                  ? "Agregar un día antes (preparativos)"
                  : "Máximo 4 días antes del evento"
              }
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> día antes
            </button>
            <button
              type="button"
              onClick={() => agregarDia(false)}
              disabled={!puedeDespues}
              title={
                puedeDespues
                  ? "Agregar un día después (desarme)"
                  : "Máximo 4 días después del evento"
              }
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CalendarPlus className="w-3.5 h-3.5" /> día después
            </button>
          </div>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="text-sm text-gray-500 py-3">
          Sin personal planificado: agrega un cargo y reparte sus días.
        </p>
      ) : (
        <GrillaDeDias
          dias={dias}
          diasFijos={diasDelEvento}
          congelado={soloLectura}
          onQuitarDia={quitarDia}
          columnaTitulo="Cargo"
          titulosValores={["Total", "Valor c/u", "Subtotal"]}
          filas={filasGrilla}
          pie={{
            etiqueta: "Jornadas del día",
            porDia: (d) => {
              const n = filas.reduce((s, f) => s + cantidadDelDia(f, d), 0);
              return n > 0 ? n : "·";
            },
            valores: [
              filas.reduce((s, f) => s + f.todas.length, 0),
              null,
              clp(costoPersonal),
            ],
          }}
        />
      )}
    </div>
  );
}
