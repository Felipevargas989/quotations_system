import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Pencil, Search, Trash2 } from "lucide-react";
import AgregadorDeItems from "../../components/selects/AgregadorDeItems";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import {
  HoraInput,
  formatoHoras,
  horasTrabajadas,
} from "../../components/inputs";
import GrillaDeDias, {
  type FilaGrillaDias,
} from "../../components/grilla/GrillaDeDias";
import Modal from "../../components/Modal";
import ResumenDelDia from "./ResumenDelDia";
import type { SelectOption } from "../../components/selects/types";
import { toast } from "../../components/toast/Toast";
import { getQuotations } from "../../services/quotations.service";
import { QuotationStatus } from "../../types/quotations.types";
import {
  getAllEventResources,
  getManagementResources,
} from "../../services/logistics.service";
import {
  addStaff,
  cargarPlanta,
  getStaffSemana,
  peopleQueryOptions,
  removeStaff,
  updateStaff,
} from "../../services/people.service";
import type { Asignacion, Persona } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { hoyEnChile } from "../../utils/dates";
import { chipTipoPersona, etiquetaTipoPersona } from "../../utils/estadoPersona";
import { formatearRut } from "../../utils/rut";

// LA SÁBANA — DONDE LA PLANIFICACIÓN RECIBE NOMBRE Y APELLIDO
//
// La grilla preliminar de cada evento (cuántos, qué días, a qué valor)
// vive en Gestión. ACÁ se junta TODO lo que viene en la semana y se le
// ponen los nombres: quién va, quién confirmó, quién falta por conseguir.
//
// Es la mesa del lunes: Felipe no se sienta a llenar el Joker No 1, se
// sienta a llenar la semana. Y la semana corre de DOMINGO a sábado, como
// su semana real (medido en el Excel: el domingo ya es semana nueva).
//
// Ver docs/arquitectura/10_MODULO_DE_PERSONAS.md

const DIA_MS = 86_400_000;

const sumarDias = (isoDia: string, n: number) =>
  new Date(new Date(`${isoDia}T00:00:00Z`).getTime() + n * DIA_MS)
    .toISOString()
    .slice(0, 10);

/** El domingo de la semana a la que pertenece el día. */
const domingoDe = (isoDia: string) => {
  const d = new Date(`${isoDia}T00:00:00Z`);
  return sumarDias(isoDia, -d.getUTCDay());
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

interface FilaSemana {
  /** null = el restaurante: el evento permanente. */
  quotationId: string | null;
  evento: string;
  cargoId: number;
  cargo: string;
  precio: number;
  necesita: Map<string, number>;
  sinRepartir: number;
}

export default function SemanaTab({ companyId }: { readonly companyId: number }) {
  const qc = useQueryClient();
  const [domingo, setDomingo] = useState(() => domingoDe(hoyEnChile()));
  // LA SÁBANA (Felipe, 15-08): se parte viendo dos semanas y se puede
  // achicar a una o abrir al mes. Siempre alineada al domingo.
  // LA SÁBANA ES MENSUAL Y FIJA (Felipe, 15-08: "dejemos la vista
  // mensual fija, así simplificamos un poco la cosa"). Antes se podía
  // elegir semana / 2 semanas / mes: tres formas de mirar lo mismo, y
  // la de un mes es la que sirve para planificar.
  const RANGO = 28;
  const [casilla, setCasilla] = useState<{ dia: string; fila: FilaSemana } | null>(null);
  // Los cargos de planta agregados a mano en esta sesión ("+ cargo"):
  // por defecto solo se muestran los que tienen gente — 10 filas siempre
  // visibles eran invasivas (Felipe, 15-08).
  const [cargosPlanta, setCargosPlanta] = useState<number[]>([]);
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);

  const dias = useMemo(
    () => Array.from({ length: RANGO }, (_, i) => sumarDias(domingo, i)),
    [domingo],
  );
  const hasta = dias[dias.length - 1];

  const { data: eventos = [] } = useQuery({
    queryKey: ["people", "eventos-semana"],
    queryFn: async () => {
      const r = (await getQuotations(
        undefined,
        [QuotationStatus.ACEPTADA, QuotationStatus.REALIZADA],
        "event_date",
        "desc",
      )) as { data?: unknown[] };
      // Se guarda TODO lo que ya viene en la misma respuesta (15-08):
      // el resumen del día lo necesita y antes se botaba.
      return ((r?.data ?? r ?? []) as Record<string, unknown>[]).map((q) => {
        const cliente = q.clients as
          | {
              name?: string;
              phone?: string;
              contact_person?: string;
              client_contacts?: { name?: string; phone?: string }[];
            }
          | undefined;
        const nombreContacto =
          (q.contact_name as string) ||
          (q.mandante as { name?: string })?.name ||
          cliente?.contact_person ||
          null;
        // El teléfono del CONTACTO, no el de la central del cliente: si
        // no, el día del evento uno llama a la recepción del colegio en
        // vez de a la persona. Misma regla que la lista de cotizaciones.
        const suyo = nombreContacto
          ? cliente?.client_contacts?.find(
              (c) =>
                (c.name ?? "").trim().toLowerCase() ===
                nombreContacto.trim().toLowerCase(),
            )?.phone
          : undefined;
        return {
          id: String(q.id),
          numero: Number(q.quotation_number),
          cliente: String(cliente?.name ?? ""),
          inicio: iso(q.event_date as string),
          termino: iso(q.event_end_date as string),
          personas: Number(q.people_count ?? 0),
          ninos: Number(q.children_count ?? 0),
          tipo: (q.event_type as string) || null,
          observaciones: (q.observations as string) || null,
          contacto: nombreContacto,
          telefono: suyo ?? cliente?.phone ?? null,
        };
      });
    },
  });

  const { data: lineas = [] } = useQuery({
    queryKey: ["people", "necesidades"],
    queryFn: () => getAllEventResources(companyId),
  });
  const { data: catalogo = [] } = useQuery({
    queryKey: ["people", "catalogo-recursos"],
    queryFn: () => getManagementResources(companyId),
  });
  const { data: staff = [] } = useQuery({
    queryKey: ["people", "staff-semana", domingo, RANGO],
    queryFn: () => getStaffSemana(domingo, hasta),
  });
  const { data: personas = [] } = useQuery(peopleQueryOptions);

  // Poner o sacar gente NO cambia las necesidades (esas viven en
  // Recursos): se refresca solo el staff de ESTA semana — una consulta,
  // no el catálogo entero de todos los eventos.
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["people", "staff-semana", domingo, RANGO] });
  };

  const poner = useMutation({
    mutationFn: (p: { personId: number; dia: string; fila: FilaSemana }) =>
      addStaff({
        quotation_id: p.fila.quotationId,
        person_id: p.personId,
        day: p.dia,
        // El restaurante no impone cargo: queda el habitual de la persona.
        role_id: p.fila.cargoId || undefined,
        amount: p.fila.precio || null,
      }),
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const sacar = useMutation({
    mutationFn: (id: number) => removeStaff(id),
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  // LA PLANTA SE CARGA SOLA, SIN BOTÓN (Felipe, 15-08: "la carga
  // debería ser automática"): al abrir la sábana o mover el rango, el
  // backend extiende la planta hacia adelante hasta el final visible,
  // saltando los días libres de cada uno. Solo hacia adelante — un día
  // borrado a mano no se recrea. Silencioso: si no había nada que
  // cargar, no molesta con avisos.
  const rangosCargados = useRef(new Set<string>());
  useEffect(() => {
    if (rangosCargados.current.has(hasta)) return;
    rangosCargados.current.add(hasta);
    cargarPlanta(hasta)
      .then((r) => {
        if (r.creadas > 0) refrescar();
      })
      .catch(() => {
        // Si falló (red, backend), que el próximo cambio de rango o
        // recarga lo reintente.
        rangosCargados.current.delete(hasta);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasta]);

  const cambiar = useMutation({
    mutationFn: (p: { id: number; cambios: Parameters<typeof updateStaff>[1] }) =>
      updateStaff(p.id, p.cambios),
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  // Las filas de la semana: cada (evento, cargo) que necesita gente en
  // estos siete días — o que ya tiene a alguien puesto.
  const filas = useMemo(() => {
    const porRecurso = new Map(catalogo.map((r) => [r.id, r]));
    const porEvento = new Map(eventos.map((e) => [e.id, e]));
    const m = new Map<string, FilaSemana>();

    for (const l of lineas) {
      const r = porRecurso.get(l.resource_id);
      const e = porEvento.get(String(l.quotation_id));
      if (!r || r.type !== "personal" || !e) continue;
      const d = iso(l.day);
      const enSemana = d !== null && d >= domingo && d <= hasta;
      // Las líneas sin repartir se avisan cuando el EVENTO cae en la semana.
      const eventoEnSemana =
        !!e.inicio && e.inicio <= hasta && (e.termino || e.inicio) >= domingo;
      if (!enSemana && !(d === null && eventoEnSemana)) continue;

      const k = `${e.id}|${r.id}`;
      if (!m.has(k)) {
        m.set(k, {
          quotationId: e.id,
          evento: `#${e.numero} · ${e.cliente}`,
          cargoId: r.id,
          cargo: r.name,
          precio: l.price_fixed || Number(r.list_price_fixed) || 0,
          necesita: new Map(),
          sinRepartir: 0,
        });
      }
      const f = m.get(k)!;
      if (d && enSemana) f.necesita.set(d, (f.necesita.get(d) || 0) + (l.quantity || 0));
      else f.sinRepartir += l.quantity || 0;
    }

    // Gente puesta en una casilla cuyo cargo ya no está costeado: la fila
    // igual se muestra, para que nadie quede invisible.
    for (const a of staff) {
      // La gente sin evento vive en "Personal de planta", más abajo: si
      // entrara acá crearía un grupo fantasma "Evento" (bug del 15-08).
      if (a.quotation_id === null) continue;
      const e = porEvento.get(String(a.quotation_id));
      const r = a.role_id ? porRecurso.get(a.role_id) : null;
      const k = `${a.quotation_id}|${a.role_id ?? 0}`;
      if (!m.has(k)) {
        m.set(k, {
          quotationId: String(a.quotation_id),
          evento: e ? `#${e.numero} · ${e.cliente}` : "Evento",
          cargoId: a.role_id ?? 0,
          cargo: r?.name ?? a.management_resources?.name ?? "Sin cargo",
          precio: Number(r?.list_price_fixed) || 0,
          necesita: new Map(),
          sinRepartir: 0,
        });
      }
    }

    const deEventos = [...m.values()].sort(
      (a, b) =>
        a.evento.localeCompare(b.evento) || a.cargo.localeCompare(b.cargo),
    );

    // EL PERSONAL DE PLANTA: el "evento" permanente (15-08). No es solo
    // el restaurante — esa es UNA de sus áreas: también patio, recepción,
    // lo que sea sin evento. Siempre presente (por eso la sábana existe
    // aunque no haya eventos) y AL FINAL, separado con su línea. Una fila
    // por cargo activo: la gente sale con su cargo.
    const conGente = new Set(
      staff
        .filter((a) => a.quotation_id === null)
        .map((a) => a.role_id ?? 0),
    );
    const restaurante: FilaSemana[] = catalogo
      .filter(
        (r) =>
          r.type === "personal" &&
          r.is_active !== false &&
          (conGente.has(r.id) || cargosPlanta.includes(r.id)),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({
        quotationId: null,
        evento: "Personal de planta",
        cargoId: r.id,
        cargo: r.name,
        precio: Number(r.list_price_fixed) || 0,
        necesita: new Map(),
        sinRepartir: 0,
      }));
    // La gente puesta con un cargo que ya no está activo no desaparece.
    const cargosActivos = new Set(restaurante.map((f) => f.cargoId));
    const huerfanos = staff.some(
      (a) => a.quotation_id === null && !cargosActivos.has(a.role_id ?? 0),
    );
    if (huerfanos)
      restaurante.push({
        quotationId: null,
        evento: "Personal de planta",
        cargoId: 0,
        cargo: "Sin cargo",
        precio: 0,
        necesita: new Map(),
        sinRepartir: 0,
      });
    // Sin filas, la banda igual existe para poder agregar el primer cargo.
    if (restaurante.length === 0)
      restaurante.push({
        quotationId: null,
        evento: "Personal de planta",
        cargoId: -1,
        cargo: "",
        precio: 0,
        necesita: new Map(),
        sinRepartir: 0,
      });
    return [...deEventos, ...restaurante];
  }, [lineas, catalogo, eventos, staff, domingo, hasta, cargosPlanta]);

  // CUÁNTOS SE NECESITAN de cada cargo ese día, para que el resumen
  // pueda decir "2 de 4" en vez de solo "2". El cálculo ya existía en la
  // sábana: acá solo se le pasa al resumen (Felipe, 15-08).
  const coberturaDelDia = (d: string) => {
    const m = new Map<string, { cargo: string; necesita: number }>();
    for (const f of filas) {
      if (f.quotationId === null) continue;
      const n = f.necesita.get(d) || 0;
      if (n > 0)
        m.set(`${f.quotationId}|${String(f.cargoId)}`, {
          cargo: f.cargo,
          necesita: n,
        });
    }
    return m;
  };

  const puestos = useMemo(() => {
    const m = new Map<string, Asignacion[]>();
    for (const a of staff) {
      const k = `${a.quotation_id}|${a.role_id ?? 0}|${iso(a.day)}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return m;
  }, [staff]);

  const enCasilla = (f: FilaSemana, d: string) =>
    f.quotationId === null
      ? staff.filter(
          (a) =>
            a.quotation_id === null &&
            iso(a.day) === d &&
            (f.cargoId === 0
              ? !catalogo.some(
                  (r) =>
                    r.id === (a.role_id ?? 0) &&
                    r.type === "personal" &&
                    r.is_active !== false,
                )
              : (a.role_id ?? 0) === f.cargoId),
        )
      : (puestos.get(`${f.quotationId}|${f.cargoId}|${d}`) ?? []);

  const faltan = filas.reduce(
    (s, f) =>
      s + dias.reduce((t, d) => t + Math.max(0, (f.necesita.get(d) || 0) - enCasilla(f, d).length), 0),
    0,
  );
  const sinRepartir = filas.reduce((s, f) => s + f.sinRepartir, 0);

  // Agrupar filas por evento para pintar el encabezado una sola vez.
  const grupos = useMemo(() => {
    const g = new Map<string, FilaSemana[]>();
    for (const f of filas) {
      if (!g.has(f.evento)) g.set(f.evento, []);
      g.get(f.evento)!.push(f);
    }
    return [...g.entries()];
  }, [filas]);

  const r0 = rotulo(domingo);
  const r6 = rotulo(hasta);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDomingo(sumarDias(domingo, -RANGO))}
            aria-label="Mes anterior"
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[13rem] text-center">
            {r0.dia} {r0.num} {r0.mes} — {r6.dia} {r6.num} {r6.mes}
          </span>
          <button
            type="button"
            onClick={() => setDomingo(sumarDias(domingo, RANGO))}
            aria-label="Mes siguiente"
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setDomingo(domingoDe(hoyEnChile()))}
            className="ml-1 px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            hoy
          </button>
        </div>
        {faltan > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <AlertTriangle className="w-4 h-4" />
            Faltan <strong>{faltan}</strong> por conseguir
          </span>
        )}
      </div>

      {sinRepartir > 0 && (
        <p className="text-xs text-amber-700">
          ⚠ Hay {sinRepartir} {sinRepartir === 1 ? "cupo" : "cupos"} sin día
          asignado en eventos de este mes: repártelos en la grilla de
          Personal del evento (Post-Venta → Gestión).
        </p>
      )}

      {(
        <GrillaDeDias
          dias={dias}
          diasFijos={new Set(dias)}
          onQuitarDia={() => {}}
          columnaTitulo="Evento · cargo"
          resaltarDia={hoyEnChile()}
          onDiaClick={(d) => {
            setCasilla(null);
            setDiaAbierto(diaAbierto === d ? null : d);
          }}
          filas={filas.map((f, fi): FilaGrillaDias => ({
            id: `${f.quotationId ?? "rest"}|${f.cargoId}`,
            grupo: f.evento,
            grupoDestacado: f.quotationId === null,
            grupoAccion:
              f.quotationId === null &&
              filas.findIndex((x) => x.quotationId === null) === fi ? (
                <div className="w-44 font-normal normal-case">
                  <SelectWithSearchCargos
                    catalogo={catalogo}
                    yaVisibles={filas
                      .filter((x) => x.quotationId === null)
                      .map((x) => x.cargoId)}
                    onAgregar={(id) => setCargosPlanta((a) => [...a, id])}
                  />
                </div>
              ) : undefined,
            titulo: (
              <>
                {f.cargo}
                {f.sinRepartir > 0 && (
                  <span
                    className="ml-2 text-[11px] text-amber-700"
                    title="Cupos sin día asignado: repártelos en la grilla del evento (Post-Venta → Gestión)"
                  >
                    +{f.sinRepartir} sin día
                  </span>
                )}
              </>
            ),
            cantidadEn: (d) => f.necesita.get(d) || 0,
            onCambiar: () => {},
            // La celda de la sábana: tiene/necesita, ámbar donde falta,
            // verde donde está cubierto. Pincha y se abre la casilla.
            renderCelda: (d) => {
              if (f.cargoId === -1) return <span className="text-gray-200"> </span>;
              const gente = enCasilla(f, d);
              const necesita = f.necesita.get(d) || 0;
              const tiene = gente.length;
              const abierta = casilla?.dia === d && casilla.fila === f;
              // Quién está y cómo va, sin abrir la casilla (Felipe, 15-08).
              const quienes = gente
                .map(
                  (a) =>
                    `${a.people?.name ?? "—"}${
                      a.status === "confirmado" ? " ✓" : " · por confirmar"
                    }`,
                )
                .join("\n");
              // El restaurante no tiene cuota: muestra cuántos van, o un
              // + para empezar a poner gente.
              if (f.quotationId === null)
                return (
                  <button
                    type="button"
                    onClick={() =>
                      setCasilla(abierta ? null : { dia: d, fila: f })
                    }
                    title={quienes || undefined}
                    className={`w-full px-2 py-1.5 rounded-md text-sm tabular-nums transition-colors ${
                      abierta
                        ? "bg-blue-600 text-white"
                        : tiene > 0
                          ? "bg-blue-50 text-blue-800 hover:bg-blue-100"
                          : "text-gray-300 hover:bg-gray-50 hover:text-gray-500"
                    }`}
                  >
                    {tiene > 0 ? tiene : "+"}
                  </button>
                );
              if (necesita === 0 && tiene === 0)
                return <span className="text-gray-200">·</span>;
              const falta = necesita - tiene;
              return (
                <button
                  type="button"
                  onClick={() => {
                    setDiaAbierto(null);
                    setCasilla(abierta ? null : { dia: d, fila: f });
                  }}
                  title={quienes || undefined}
                  className={`w-full px-2 py-1.5 rounded-md text-sm tabular-nums transition-colors ${
                    abierta
                      ? "bg-blue-600 text-white"
                      : falta > 0
                        ? "bg-amber-50 text-amber-800 hover:bg-amber-100"
                        : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  }`}
                >
                  {tiene}/{necesita}
                </button>
              );
            },
          }))}
        />
      )}

      {diaAbierto && (
        <ResumenDelDia
          dia={diaAbierto}
          eventos={eventos}
          staff={staff}
          companyId={companyId}
          cobertura={coberturaDelDia(diaAbierto)}
          onCerrar={() => setDiaAbierto(null)}
        />
      )}

      {casilla && (
        <CasillaAbierta
          dia={casilla.dia}
          dias={dias}
          fila={casilla.fila}
          asignados={enCasilla(casilla.fila, casilla.dia)}
          personas={personas}
          onCerrar={() => setCasilla(null)}
          onPoner={(personId) =>
            poner.mutate({ personId, dia: casilla.dia, fila: casilla.fila })
          }
          onSacar={(id) => sacar.mutate(id)}
          onCambiar={(id, cambios) => cambiar.mutate({ id, cambios })}
        />
      )}
    </div>
  );
}

/** El "+ cargo" de la banda de Personal de planta. */
function SelectWithSearchCargos({
  catalogo,
  yaVisibles,
  onAgregar,
}: {
  readonly catalogo: readonly { id: number; name: string; type: string; is_active: boolean }[];
  readonly yaVisibles: readonly number[];
  readonly onAgregar: (id: number) => void;
}) {
  const opciones = catalogo
    .filter(
      (r) =>
        r.type === "personal" &&
        r.is_active !== false &&
        !yaVisibles.includes(r.id),
    )
    .map((r) => ({ value: String(r.id), label: r.name }));
  return (
    <SelectWithSearch
      options={opciones}
      value=""
      onChange={(v) => v && onAgregar(Number(v))}
      placeholder="+ cargo"
      tamano="sm"
      mostrarConteo={false}
    />
  );
}

/** El horario de una asignación: en reposo, UNA línea de texto; los
 *  relojes solo se abren al pinchar el lápiz ("visualmente enredado",
 *  Felipe 15-08). */
function HorarioDelDia({
  asignacion: a,
  onCambiar,
}: {
  readonly asignacion: Asignacion;
  readonly onCambiar: (id: number, cambios: Parameters<typeof updateStaff>[1]) => void;
}) {
  const [editando, setEditando] = useState(false);
  const horas = horasTrabajadas(a.starts_at, a.ends_at, a.break_minutes);
  const TOPE_INFORMATIVO = 12;

  if (!editando) {
    const colacion =
      a.break_minutes === 60
        ? " · col. 1 h"
        : a.break_minutes === 30
          ? " · col. 30 m"
          : "";
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>
          {a.starts_at && a.ends_at
            ? `${a.starts_at.slice(0, 5)}–${a.ends_at.slice(0, 5)}${colacion}`
            : "sin horario"}
        </span>
        {horas !== null && (
          <span
            className={`tabular-nums font-medium ${
              horas > TOPE_INFORMATIVO ? "text-amber-700" : "text-gray-700"
            }`}
            title={
              horas > TOPE_INFORMATIVO
                ? `Más de ${TOPE_INFORMATIVO} horas — está bien si así se pactó; a veces convienen dos turnos`
                : "Horas trabajadas, con la colación descontada"
            }
          >
            · {formatoHoras(horas)}
            {horas > TOPE_INFORMATIVO && " ⚠"}
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditando(true)}
          aria-label="Editar el horario"
          className="p-0.5 text-gray-400 hover:text-blue-600 rounded"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600">
      <HoraInput
        value={a.starts_at}
        onChange={(v) => onCambiar(a.id, { starts_at: v })}
        compacta
        aria-label={`Entrada de ${a.people?.name}`}
      />
      <span className="text-gray-400">a</span>
      <HoraInput
        value={a.ends_at}
        onChange={(v) => onCambiar(a.id, { ends_at: v })}
        compacta
        aria-label={`Salida de ${a.people?.name}`}
      />
      <span className="text-gray-400">· colación</span>
      <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
        {[
          [0, "—"],
          [30, "30 m"],
          [60, "1 h"],
        ].map(([min, texto]) => (
          <button
            key={min}
            type="button"
            onClick={() => onCambiar(a.id, { break_minutes: Number(min) || null })}
            className={`px-1.5 py-0.5 ${
              (a.break_minutes || 0) === min
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>
      <span className="ml-auto tabular-nums font-medium text-gray-700">
        {formatoHoras(horas)}
      </span>
      <button
        type="button"
        onClick={() => setEditando(false)}
        aria-label="Listo"
        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
      >
        <Check className="w-4 h-4" />
      </button>
    </div>
  );
}

/** La casilla abierta: quiénes van ese día, en ese cargo, en ese evento. */
function CasillaAbierta({
  dia,
  dias,
  fila,
  asignados,
  personas,
  onCerrar,
  onPoner,
  onSacar,
  onCambiar,
}: {
  readonly dia: string;
  /** El rango visible de la sábana, para mover a otro día. */
  readonly dias: readonly string[];
  readonly fila: FilaSemana;
  readonly asignados: Asignacion[];
  readonly personas: readonly Persona[];
  readonly onCerrar: () => void;
  readonly onPoner: (personId: number) => void;
  readonly onSacar: (id: number) => void;
  readonly onCambiar: (id: number, cambios: Parameters<typeof updateStaff>[1]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [moviendo, setMoviendo] = useState<number | null>(null);
  const r = rotulo(dia);
  const necesita = fila.necesita.get(dia) || 0;
  const puestos = new Set(asignados.map((a) => a.person_id));

  // Los bloqueados y los no disponibles no se ofrecen — pero no se borran:
  // siguen en la libreta, y en la nómina si se les debe.
  const diaSemana = new Date(`${dia}T00:00:00Z`).getUTCDay();
  const disponibles: SelectOption[] = personas
    .filter((p) => p.status === "activa" && !puestos.has(p.id))
    .map((p) => ({
      value: String(p.id),
      label: p.name,
      hint: [
        // Si es su día libre se avisa PRIMERO — se puede poner igual
        // (a veces se le paga el día libre como freelance), pero a
        // sabiendas.
        p.days_off?.includes(diaSemana) ? "⚠ LIBRE este día" : undefined,
        p.management_resources?.name,
        p.default_kind === "planta" ? "planta" : undefined,
        p.rut ? formatearRut(p.rut) : "sin RUT",
      ]
        .filter(Boolean)
        .join(" · "),
    }));

  return (
    <Modal
      titulo={`${fila.cargo} · ${r.dia} ${String(r.num)} de ${r.mes}`}
      subtitulo={
        <>
          {fila.evento}
          <span className="mx-1 text-gray-300">·</span>
          {fila.quotationId === null
            ? `${String(asignados.length)} en el día`
            : `${String(asignados.length)} de ${String(necesita)}`}
        </>
      }
      ancho="max-w-3xl"
      bloquearEscape={abierto}
      sinTope
      onCerrar={onCerrar}
    >
      <div className="space-y-3">
      {/* EL AGREGADOR VA ARRIBA (15-08): su lista se abre SIEMPRE hacia
          abajo, y al final de un modal con tope de alto quedaba cortada.
          Además se lee mejor: primero se pone gente, después se revisa
          la que ya está. */}
      <AgregadorDeItems
        opciones={disponibles}
        onAgregar={(v) => onPoner(Number(v))}
        abierto={abierto}
        onAbiertoChange={setAbierto}
        placeholder="Buscar y poner a alguien…"
      />

      {asignados.length > 0 && (
        <ul className="space-y-1.5">
          {asignados.map((a) => (
            <li key={a.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-gray-900">{a.people?.name ?? "—"}</span>
              <button
                type="button"
                onClick={() =>
                  onCambiar(a.id, { kind: a.kind === "planta" ? "freelance" : "planta" })
                }
                title="Cambiar entre planta y freelance SOLO para este día"
                className={`text-xs px-2 py-0.5 rounded-full ${chipTipoPersona(a.kind)}`}
              >
                {etiquetaTipoPersona(a.kind)}
              </button>
              <span className="w-24 text-right tabular-nums text-sm text-gray-600">
                {a.kind === "planta" ? (
                  <span className="text-gray-400" title="De planta: no cuesta un peso extra">
                    —
                  </span>
                ) : (
                  clp(a.amount ?? fila.precio)
                )}
              </span>
              <button
                type="button"
                onClick={() =>
                  onCambiar(a.id, {
                    status: a.status === "confirmado" ? "por_confirmar" : "confirmado",
                  })
                }
                title={a.status === "confirmado" ? "Confirmada" : "Por confirmar"}
                className={`p-1 rounded ${
                  a.status === "confirmado"
                    ? "text-emerald-600 hover:bg-emerald-50"
                    : "text-amber-500 hover:bg-amber-50"
                }`}
              >
                {a.status === "confirmado" ? <Check className="w-4 h-4" /> : <Search className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setMoviendo(moviendo === a.id ? null : a.id)}
                title="Mover a otro día"
                aria-label={`Mover a ${a.people?.name} a otro día`}
                className={`p-1 rounded ${
                  moviendo === a.id
                    ? "text-blue-700 bg-blue-50"
                    : "text-gray-400 hover:text-blue-700 hover:bg-blue-50"
                }`}
              >
                <CalendarDays className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onSacar(a.id)}
                aria-label={`Sacar a ${a.people?.name}`}
                className="p-1 text-gray-300 hover:text-red-600 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* MOVER DE DÍA (Felipe, 15-08: "pasa mucho que cambiamos
                días para adecuarnos al trabajo"): se elige el día nuevo
                del rango visible y la asignación se muda con su horario
                y todo. Si allá ya estaba, el backend lo dice y no pasa
                nada. Los libres de la persona salen en ámbar. */}
            {moviendo === a.id && (
              <div className="flex flex-wrap items-center gap-1 pt-1">
                <span className="text-xs text-gray-500 mr-1">Mover al:</span>
                {dias
                  .filter((d) => d !== dia)
                  .map((d) => {
                    const rd = rotulo(d);
                    const persona = personas.find((p) => p.id === a.person_id);
                    const libre = persona?.days_off?.includes(
                      new Date(`${d}T00:00:00Z`).getUTCDay(),
                    );
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          onCambiar(a.id, { day: d });
                          setMoviendo(null);
                        }}
                        title={libre ? "Es su día libre" : undefined}
                        className={`px-1.5 py-0.5 text-[11px] rounded border ${
                          libre
                            ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                            : "bg-white border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-200"
                        }`}
                      >
                        {rd.dia} {rd.num}
                      </button>
                    );
                  })}
              </div>
            )}

            {/* El horario del DÍA (etapa 4): editable para todos — planta
                y freelance — porque cuando el cliente parte antes, se
                conversa y se ajusta. La colación se descuenta (30 min o
                1 h) y las horas se calculan solas. El tope es INFORMATIVO:
                un freelance de 12 horas está bien pagado; el aviso sirve
                para pensar si convenían dos turnos. */}
            <HorarioDelDia asignacion={a} onCambiar={onCambiar} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-gray-500">
        El tipo y el monto son <strong>de este día</strong>: cambiarlos acá no
        toca la ficha de la persona. Un planta que trabaja en su día libre se
        marca freelance y esa jornada sí se paga.
      </p>
      </div>
    </Modal>
  );
}
