import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Pencil, Search, Trash2, X } from "lucide-react";
import AgregadorDeItems from "../../components/selects/AgregadorDeItems";
import NumberInput from "../../components/inputs/NumberInput";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import {
  HoraInput,
  formatoHoras,
  horasTrabajadas,
  SelectorColacion,
} from "../../components/inputs";
import GrillaDeDias, {
  type FilaGrillaDias,
} from "../../components/grilla/GrillaDeDias";
import Modal from "../../components/Modal";
import ResumenDelDia from "./ResumenDelDia";
import MiniCalendario from "./MiniCalendario";
import type { SelectOption } from "../../components/selects/types";
import { toast } from "../../components/toast/Toast";
import { getQuotations } from "../../services/quotations.service";
import { QuotationStatus } from "../../types/quotations.types";
import {
  getManagementResources,
} from "../../services/logistics.service";
import {
  addStaff,
  proyectarPlanta,
  getStaffSemana,
  peopleQueryOptions,
  removeStaff,
  updateStaff,
} from "../../services/people.service";
import type { Asignacion, Persona } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { hoyEnChile } from "../../utils/dates";
import { chipTipoPersona, etiquetaTipoPersona } from "../../utils/estadoPersona";
import { esPlanificacion } from "./estadoDelPago";
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
  necesita: Map<string, number>;
  sinRepartir: number;
  /** Los días que dura el evento, dentro del rango visible. Sirven para
   *  MARCARLOS en la grilla —"no sale ninguna marca de cuándo es"
   *  (Felipe, 15-08)— y para poder poner gente ahí aunque el cupo haya
   *  quedado sin día. */
  diasDelEvento: ReadonlySet<string>;
  /** Solo en el Staff: el cargo NO tiene gente de planta, es refuerzo
   *  que se llama por día (un salvavidas en verano). Va abajo y con
   *  otro color. */
  ocasional?: boolean;
}

/** El rótulo de un evento CON SU FECHA: "#400 · Municipalidad de
 *  Quillón · sáb 22 ago". Sin la fecha no se sabe cuándo es, que era
 *  justo el problema (Felipe, 15-08). */
const rotuloEvento = (e: {
  numero: number;
  cliente: string;
  inicio: string | null;
  termino: string | null;
}) => {
  const base = `#${String(e.numero)} · ${e.cliente}`;
  if (!e.inicio) return base;
  const r0 = rotulo(e.inicio);
  const fin = e.termino && e.termino !== e.inicio ? rotulo(e.termino) : null;
  return fin
    ? `${base} · ${r0.dia} ${String(r0.num)} ${r0.mes} al ${fin.dia} ${String(fin.num)} ${fin.mes}`
    : `${base} · ${r0.dia} ${String(r0.num)} ${r0.mes}`;
};

/** Los días que dura un evento, uno por uno. */
const diasDe = (e: { inicio: string | null; termino: string | null }) => {
  const salida = new Set<string>();
  if (!e.inicio) return salida;
  const fin = e.termino && e.termino > e.inicio ? e.termino : e.inicio;
  for (let d = e.inicio; d <= fin; d = sumarDias(d, 1)) salida.add(d);
  return salida;
};

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

  const { data: catalogo = [] } = useQuery({
    queryKey: ["people", "catalogo-recursos"],
    queryFn: () => getManagementResources(companyId),
  });
  const { data: staffCrudo = [] } = useQuery({
    queryKey: ["people", "staff-semana", domingo, RANGO],
    queryFn: () => getStaffSemana(domingo, hasta),
  });
  // La sábana es PLANIFICACIÓN: la planta que la ficha de liquidación
  // trae a un evento no entra acá (Felipe, 18-08). Ver esPlanificacion.
  const staff = useMemo(() => staffCrudo.filter(esPlanificacion), [staffCrudo]);
  const { data: personas = [] } = useQuery(peopleQueryOptions);

  // Poner o sacar gente NO cambia las necesidades (esas viven en
  // Recursos): se refresca solo el staff de ESTA semana — una consulta,
  // no el catálogo entero de todos los eventos.
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["people", "staff-semana", domingo, RANGO] });
  };

  const poner = useMutation({
    // EL CRUCE (Felipe, 15-08): si esa persona ya viene de planta ese
    // día, no puede estar además en un evento — ya está comprometida.
    // Y al revés: si está en un evento, no se le agrega jornada de
    // planta el mismo día.
    mutationFn: (p: { personId: number; dia: string; fila: FilaSemana }) => {
      const suyas = staff.filter(
        (a) => a.person_id === p.personId && iso(a.day) === p.dia,
      );
      const enPlanta = suyas.some((a) => a.quotation_id === null);
      const enEvento = suyas.some((a) => a.quotation_id !== null);
      if (p.fila.quotationId !== null && enPlanta) {
        throw new Error(
          "Ese día viene de planta: no se le puede asignar además un evento.",
        );
      }
      if (p.fila.quotationId === null && enEvento) {
        throw new Error(
          "Ese día está en un evento: no se le puede agregar además la planta.",
        );
      }
      const persona = personas.find((x) => x.id === p.personId);
      if (p.fila.quotationId !== null && persona?.default_kind === "planta") {
        // Se avisa, no se impide: traerlo es legítimo, pero hay que
        // saber que ese día se le paga aparte de su sueldo.
        toast.warn(
          `Es un día extra para ${persona.name}: se le paga aparte de su sueldo. Ponle el monto.`,
        );
      }
      return addStaff({
        quotation_id: p.fila.quotationId,
        person_id: p.personId,
        day: p.dia,
        // El restaurante no impone cargo: queda el habitual de la persona.
        role_id: p.fila.cargoId || undefined,
        // Sin monto: en un evento la SILLA ya trae el suyo y el backend
        // lo conserva al sentar; en el restaurante se escribe a mano en
        // la casilla. No hay valor por cargo (Felipe, 17-08).
        amount: null,
      });
    },
    // LA PANTALLA SE MUEVE AL INSTANTE (17-08, "asignar garzones está
    // lento"): la persona aparece en la casilla en el acto con una fila
    // provisoria, y el servidor se reconcilia después. Si rechaza, se
    // devuelve sola. Es el mismo patrón de la grilla de Gestión y del
    // calendario de la ficha.
    onMutate: async (p) => {
      const clave = ["people", "staff-semana", domingo, RANGO];
      await qc.cancelQueries({ queryKey: clave });
      const antes = qc.getQueryData<Asignacion[]>(clave);
      const persona = personas.find((x) => x.id === p.personId);
      qc.setQueryData<Asignacion[]>(clave, (viejo = []) => [
        ...viejo,
        {
          id: -Math.floor(Math.random() * 1e9),
          quotation_id: p.fila.quotationId,
          person_id: p.personId,
          day: p.dia,
          role_id: p.fila.cargoId || null,
          // EN UN EVENTO LA FILA OPTIMISTA NACE FREELANCE (Felipe,
          // 25-08: "se demoran en cargar los de planta libre"). Con el
          // kind de la persona (planta), esPlanificacion la escondía y
          // el "al instante" quedaba invisible hasta el refresco. En un
          // evento lo planificado es SIEMPRE freelance — igual que hará
          // el backend con el día extra.
          kind:
            p.fila.quotationId !== null
              ? "freelance"
              : (persona?.default_kind ?? "freelance"),
          status: "por_confirmar",
          amount: null,
          starts_at: null,
          ends_at: null,
          break_minutes: null,
          people: persona
            ? { id: persona.id, name: persona.name, rut: persona.rut ?? null }
            : null,
          management_resources: null,
        } as unknown as Asignacion,
      ]);
      return { antes };
    },
    onError: (e: unknown, _p, ctx) => {
      if (ctx?.antes)
        qc.setQueryData(["people", "staff-semana", domingo, RANGO], ctx.antes);
      toast.error(humanizeApiError(e));
    },
    onSettled: refrescar,
  });
  const sacar = useMutation({
    // En un evento, sacar a alguien LIBERA su silla: el cupo queda con
    // su cargo, su día y su valor, esperando otro nombre (migración 84).
    // En el restaurante no hay sillas: se borra la fila.
    mutationFn: (id: number) => {
      if (id < 0) throw new Error("Esa fila se está guardando todavía");
      const fila = staff.find((a) => a.id === id);
      return removeStaff(id, !!fila?.quotation_id);
    },
    // Al instante, igual que poner: la fila desaparece (restaurante) o
    // queda como silla vacía (evento) sin esperar al servidor.
    onMutate: async (id) => {
      const clave = ["people", "staff-semana", domingo, RANGO];
      await qc.cancelQueries({ queryKey: clave });
      const antes = qc.getQueryData<Asignacion[]>(clave);
      qc.setQueryData<Asignacion[]>(clave, (viejo = []) =>
        viejo.flatMap((a) => {
          if (a.id !== id) return [a];
          return a.quotation_id
            ? [{ ...a, person_id: null, people: null, status: "por_confirmar" } as Asignacion]
            : [];
        }),
      );
      return { antes };
    },
    onError: (e: unknown, _id, ctx) => {
      if (ctx?.antes)
        qc.setQueryData(["people", "staff-semana", domingo, RANGO], ctx.antes);
      toast.error(humanizeApiError(e));
    },
    onSettled: refrescar,
  });
  // LA PLANTA SE PROYECTA A 12 MESES, UNA VEZ POR SESIÓN (Felipe,
  // 15-08: "no estar cargando y metiéndole sobrecarga cada vez que
  // pincho"; y 18-08: "la navegabilidad está más lenta" — el useRef
  // vivía con el componente, así que CADA entrada a la pestaña volvía a
  // proyectar: 3 segundos de base de datos por paseo. sessionStorage
  // sobrevive a la navegación; se proyecta al primer Personal del día y
  // listo. Crear o editar una persona reproyecta lo suyo por su lado,
  // así que no se pierde nada.
  const yaProyectado = useRef(false);
  useEffect(() => {
    const LLAVE = "planta-proyectada";
    if (yaProyectado.current || sessionStorage.getItem(LLAVE)) return;
    yaProyectado.current = true;
    sessionStorage.setItem(LLAVE, "1");
    proyectarPlanta()
      .then((r) => {
        if (r.creadas > 0) refrescar();
      })
      .catch(() => {
        yaProyectado.current = false;
        sessionStorage.removeItem(LLAVE);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // LAS NECESIDADES SON LAS SILLAS (migración 84): cada fila de
    // event_staff de un evento es un cupo — con nombre o vacío. La
    // casilla muestra a los sentados; "necesita" cuenta TODAS las
    // sillas. Antes venían de event_resources, y poner un cuarto garzón
    // no movía la necesidad: eran dos mundos sin cable.
    for (const a of staff) {
      if (a.quotation_id === null) continue;
      const e = porEvento.get(String(a.quotation_id));
      const r = a.role_id ? porRecurso.get(a.role_id) : null;
      if (!e) continue;
      const d = iso(a.day);
      const enSemana = d !== null && d >= domingo && d <= hasta;
      // Las sillas sin día se avisan cuando el EVENTO cae en la semana.
      const eventoEnSemana =
        !!e.inicio && e.inicio <= hasta && (e.termino || e.inicio) >= domingo;
      if (!enSemana && !(d === null && eventoEnSemana)) continue;

      const k = `${e.id}|${a.role_id ?? 0}`;
      if (!m.has(k)) {
        m.set(k, {
          quotationId: e.id,
          evento: rotuloEvento(e),
          cargoId: a.role_id ?? 0,
          cargo: r?.name ?? a.management_resources?.name ?? "Sin cargo",
          necesita: new Map(),
          sinRepartir: 0,
          diasDelEvento: diasDe(e),
        });
      }
      const f = m.get(k)!;
      if (d && enSemana) f.necesita.set(d, (f.necesita.get(d) || 0) + 1);
      else if (a.person_id == null) f.sinRepartir += 1;
    }

    // Gente puesta en una casilla cuyo cargo ya no está costeado: la fila
    // igual se muestra, para que nadie quede invisible.
    for (const a of staff) {
      // La gente sin evento vive en el Staff, más abajo: si
      // entrara acá crearía un grupo fantasma "Evento" (bug del 15-08).
      if (a.quotation_id === null) continue;
      const e = porEvento.get(String(a.quotation_id));
      const r = a.role_id ? porRecurso.get(a.role_id) : null;
      const k = `${a.quotation_id}|${a.role_id ?? 0}`;
      if (!m.has(k)) {
        m.set(k, {
          quotationId: String(a.quotation_id),
          evento: e ? rotuloEvento(e) : "Evento",
          cargoId: a.role_id ?? 0,
          cargo: r?.name ?? a.management_resources?.name ?? "Sin cargo",
          necesita: new Map(),
          sinRepartir: 0,
          diasDelEvento: e ? diasDe(e) : new Set<string>(),
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
        evento: "Staff",
        cargoId: r.id,
        cargo: r.name,
        necesita: new Map(),
        sinRepartir: 0,
        diasDelEvento: new Set<string>(),
      }));
    // La gente puesta con un cargo que ya no está activo no desaparece.
    const cargosActivos = new Set(restaurante.map((f) => f.cargoId));
    const huerfanos = staff.some(
      (a) => a.quotation_id === null && !cargosActivos.has(a.role_id ?? 0),
    );
    if (huerfanos)
      restaurante.push({
        quotationId: null,
        evento: "Staff",
        cargoId: 0,
        cargo: "Sin cargo",
        necesita: new Map(),
        sinRepartir: 0,
        diasDelEvento: new Set<string>(),
      });

    // EL STAFF EN DOS GRUPOS (Felipe, 15-08): arriba los cargos con
    // gente de PLANTA, abajo los ocasionales —el salvavidas que se
    // llama por día—. Un cargo es de planta si alguien de planta tiene
    // jornada ahí; si no, es ocasional.
    const conPlanta = new Set(
      staff
        .filter((a) => a.quotation_id === null && a.kind === "planta")
        .map((a) => a.role_id ?? 0),
    );
    const staffOrdenado = restaurante
      .map((f) => ({ ...f, ocasional: !conPlanta.has(f.cargoId) }))
      .sort((a, b) => {
        if (a.ocasional !== b.ocasional) return a.ocasional ? 1 : -1;
        return a.cargo.localeCompare(b.cargo);
      });
    // La banda de Personal Staff existe SIEMPRE: es donde vive el
    // "+ cargo" (Felipe, 15-08). Sin esta fila vacía, cuando no hay
    // ningún cargo ocasional no habría dónde agregar el primero.
    if (!staffOrdenado.some((f) => f.ocasional))
      staffOrdenado.push({
        quotationId: null,
        evento: "Staff",
        cargoId: -1,
        cargo: "",
        necesita: new Map(),
        sinRepartir: 0,
        diasDelEvento: new Set<string>(),
        ocasional: true,
      });
    return [...deEventos, ...staffOrdenado];
  }, [catalogo, eventos, staff, domingo, hasta, cargosPlanta]);

  // CUÁNTOS SE NECESITAN de cada cargo ese día, para que el resumen
  // pueda decir "2 de 4" en vez de solo "2". El cálculo ya existía en la
  // sábana: acá solo se le pasa al resumen (Felipe, 15-08).
  // Los días del mes en que una persona ya viene de PLANTA (sin evento).
  const diasDePlanta = (personId: number) =>
    new Set(
      staff
        .filter((a) => a.person_id === personId && a.quotation_id === null)
        .map((a) => iso(a.day) ?? ""),
    );
  const diasEnEvento = (personId: number) =>
    new Set(
      staff
        .filter((a) => a.person_id === personId && a.quotation_id !== null)
        .map((a) => iso(a.day) ?? ""),
    );

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
      // La casilla muestra a los SENTADOS; una silla vacía no es nadie
      // todavía — es el "necesita" contra el que se compara.
      if (a.person_id == null) continue;
      const k = `${a.quotation_id}|${a.role_id ?? 0}|${iso(a.day)}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return m;
  }, [staff]);

  const enCasilla = (f: FilaSemana, d: string) => {
    const xs =
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
    // LISTA DE AGREGADO (Felipe, 25-08, tercera y definitiva): "que el
    // personal que voy agregando vaya quedando en el último lugar". Se
    // ordena por el sello puesto_en (migración 90: cuándo se sentó a la
    // persona — la silla reusada ya no engaña); lo anterior a la
    // migración usa su created_at, y la fila optimista (id negativo) va
    // al final, que es donde quedará al guardarse.
    const llegada = (a: Asignacion) => {
      if (a.id < 0) return Number.MAX_SAFE_INTEGER;
      const sello = a.puesto_en ?? a.created_at;
      return sello ? new Date(sello).getTime() : a.id;
    };
    return xs.slice().sort((a, b) => llegada(a) - llegada(b));
  };

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
            grupo:
              f.quotationId === null
                ? f.ocasional
                  ? "Personal Staff"
                  : "Personal de planta"
                : f.evento,
            grupoDestacado:
              f.quotationId === null &&
              filas.findIndex((x) => x.quotationId === null) === fi,
            grupoAccion:
              f.quotationId === null &&
              f.ocasional &&
              filas.findIndex((x) => x.quotationId === null && x.ocasional) ===
                fi ? (
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
                {/* Un cargo ocasional SIN NADIE se puede sacar de la
                    vista al toque (Felipe, 15-08). Con gente puesta la
                    ✕ no aparece: primero se saca a la gente. */}
                {f.ocasional &&
                  cargosPlanta.includes(f.cargoId) &&
                  !staff.some(
                    (a) =>
                      a.quotation_id === null && (a.role_id ?? 0) === f.cargoId,
                  ) && (
                    <button
                      type="button"
                      onClick={() =>
                        setCargosPlanta((a) => a.filter((x) => x !== f.cargoId))
                      }
                      aria-label={`Quitar el cargo ${f.cargo}`}
                      title="Quitar este cargo de la vista"
                      className="ml-1.5 text-gray-300 hover:text-red-600 align-middle"
                    >
                      <X className="w-3.5 h-3.5 inline" />
                    </button>
                  )}
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
              // UNA SOLA REGLA (Felipe, 15-08): verde solo si están
              // TODOS y todos confirmados. Dos nombres puestos que no
              // han confirmado no son un día resuelto — todavía te
              // pueden fallar.
              const porConfirmar = gente.filter(
                (a) => a.status !== "confirmado",
              ).length;
              const listo = tiene >= necesita && necesita > 0 && porConfirmar === 0;
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
                    title={
                    [
                      necesita > 0
                        ? `${String(tiene)} de ${String(necesita)}`
                        : `${String(tiene)} puestos, sin cupo costeado`,
                      porConfirmar > 0
                        ? `${String(porConfirmar)} por confirmar`
                        : null,
                      quienes || null,
                    ]
                      .filter(Boolean)
                      .join("\n") || undefined
                  }
                    className={`w-full flex items-center justify-center px-2 py-1.5 rounded-md text-sm tabular-nums transition-colors ${
                      abierta
                        ? "bg-blue-600 text-white"
                        : tiene === 0
                          ? "text-gray-300 hover:bg-gray-50 hover:text-gray-500"
                          : // LA MISMA REGLA QUE ARRIBA (Felipe, 17-08):
                            // ámbar mientras alguien esté por confirmar,
                            // y recién con todos confirmados el color
                            // propio — LILA el refuerzo por día, AZUL la
                            // planta. Antes el Staff no distinguía nada.
                            porConfirmar > 0
                            ? "bg-amber-50 text-amber-800 hover:bg-amber-100"
                            : f.ocasional
                              ? "bg-violet-50 text-violet-800 hover:bg-violet-100"
                              : "bg-blue-50 text-blue-800 hover:bg-blue-100"
                    }`}
                  >
                    {tiene > 0 ? tiene : "+"}
                  </button>
                );
              // UN DÍA DEL EVENTO SIEMPRE SE PUEDE USAR, tenga o no
              // cupo asignado (Felipe, 15-08: "tampoco puedo agregarle
              // acá personal"). Antes, si el cupo había quedado "sin
              // día", la casilla era un punto muerto.
              const esDelEvento = f.diasDelEvento.has(d);
              if (necesita === 0 && tiene === 0) {
                if (!esDelEvento)
                  return <span className="text-gray-200">·</span>;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      setDiaAbierto(null);
                      setCasilla(abierta ? null : { dia: d, fila: f });
                    }}
                    title={`Es día del evento — poner gente el ${d}`}
                    // Recuadro ÁMBAR: es el día del evento y no hay
                    // nadie puesto. Salta a la vista sin leer nada
                    // (Felipe, 15-08).
                    className={`w-full flex items-center justify-center px-2 py-1.5 rounded-md text-sm border transition-colors ${
                      abierta
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
                    }`}
                  >
                    +
                  </button>
                );
              }
              return (
                <button
                  type="button"
                  onClick={() => {
                    setDiaAbierto(null);
                    setCasilla(abierta ? null : { dia: d, fila: f });
                  }}
                  title={
                    [
                      necesita > 0
                        ? `${String(tiene)} de ${String(necesita)}`
                        : `${String(tiene)} puestos, sin cupo costeado`,
                      porConfirmar > 0
                        ? `${String(porConfirmar)} por confirmar`
                        : null,
                      quienes || null,
                    ]
                      .filter(Boolean)
                      .join("\n") || undefined
                  }
                  // Sin cupos que cubrir no hay contra qué comparar: se
                  // muestra solo cuánta gente hay, sin el "/0" que
                  // parecía un error.
                  className={`w-full flex items-center justify-center px-2 py-1.5 rounded-md text-sm tabular-nums transition-colors border ${
                    abierta
                      ? "bg-blue-600 text-white border-blue-600"
                      : listo
                        ? `bg-emerald-50 text-emerald-800 hover:bg-emerald-100 ${
                            esDelEvento
                              ? "border-emerald-300"
                              : "border-transparent"
                          }`
                        : // Todo lo que no está resuelto va ámbar: suave
                          // por dentro y el borde más fuerte.
                          "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                  }`}
                >
                  {necesita === 0 ? tiene : `${String(tiene)}/${String(necesita)}`}
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
          ocupados={
            new Set(
              staff
                .filter((a) => {
                  if (iso(a.day) !== casilla.dia) return false;
                  // Los de ESTA casilla no cuentan: ya salen abajo. La
                  // casilla es evento + cargo, no solo el evento — si no,
                  // en la planta (null contra null) no se excluía a
                  // nadie y salían todos.
                  const mismaCasilla =
                    String(a.quotation_id) ===
                      String(casilla.fila.quotationId) &&
                    (a.role_id ?? 0) === casilla.fila.cargoId;
                  return !mismaCasilla;
                })
                .map((a) => a.person_id)
                // Una silla vacía no ocupa a nadie.
                .filter((id): id is number => id != null),
            )
          }
          diasDePlanta={diasDePlanta}
          diasEnEvento={diasEnEvento}
          todoElStaff={staff}
          onPonerEnDia={(personId, d) =>
            poner.mutate({ personId, dia: d, fila: casilla.fila })
          }
          onSacarDelDia={(personId, d) => {
            const suya = staff.find(
              (x) =>
                x.person_id === personId &&
                iso(x.day) === d &&
                x.quotation_id === null,
            );
            if (suya) sacar.mutate(suya.id);
          }}
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
      <SelectorColacion
        value={a.break_minutes}
        onChange={(min) => onCambiar(a.id, { break_minutes: min })}
      />
      <span className="ml-auto tabular-nums font-medium text-gray-700">
        {formatoHoras(horas)}
      </span>
      <button
        type="button"
        onClick={() => setEditando(false)}
        className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-white border border-emerald-300 rounded-md hover:bg-emerald-50"
      >
        Listo
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
  ocupados,
  diasDePlanta,
  diasEnEvento,
  todoElStaff,
  onPonerEnDia,
  onSacarDelDia,
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
  /** Los días del mes en que esa persona ya viene de planta. */
  /** Quiénes YA tienen jornada ese día en otra parte (su planta, u
   *  otro evento). No se ofrecen: ya están ocupados. */
  readonly ocupados: ReadonlySet<number>;
  readonly diasDePlanta: (personId: number) => ReadonlySet<string>;
  /** Los días del mes en que esa persona está en un evento. */
  readonly diasEnEvento: (personId: number) => ReadonlySet<string>;
  /** Todas las jornadas del rango, para que el mini calendario muestre
   *  cargo, horas y estado de cada día de la persona. */
  readonly todoElStaff: readonly Asignacion[];
  readonly onPonerEnDia: (personId: number, dia: string) => void;
  readonly onSacarDelDia: (personId: number, dia: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [moviendo, setMoviendo] = useState<number | null>(null);
  const r = rotulo(dia);
  const necesita = fila.necesita.get(dia) || 0;
  const puestos = new Set(asignados.map((a) => a.person_id));

  // Los bloqueados y los no disponibles no se ofrecen — pero no se borran:
  // siguen en la libreta, y en la nómina si se les debe.
  const diaSemana = new Date(`${dia}T00:00:00Z`).getUTCDay();
  // EN SECCIONES, como los menús variables (Felipe, 15-08): la planta
  // arriba y el staff abajo. Con la sección puesta, repetir "planta" en
  // cada línea sobra — y el RUT acá no ayuda a decidir a quién poner.
  // EN LA PLANTA SOLO SU PROPIA GENTE Y SU PROPIO CARGO (Felipe,
  // 15-08): esa sección administra la jornada del equipo fijo, no es
  // para traer gente. Sin esto se podía tomar a una cocinera y meterla
  // en "Personal aseo", donde quedaba con el color de la planta y
  // escondida dentro de su formato, como si fuera su jornada normal.
  // Para traer a alguien está la sección de Personal Staff.
  const soloPlantaDeEsteCargo =
    fila.quotationId === null && !fila.ocasional;

  // LA LISTA ES SOLO DE DISPONIBLES (Felipe, 18-08): "si el de planta
  // tiene turno no debería mostrármelo, y si viene como staff tampoco".
  // Ocupado ese día —en el restaurante, en otro evento o ya en esta
  // casilla— no aparece. En un EVENTO, la planta con turno de
  // restaurante está ocupada aunque su fila no se haya proyectado
  // todavía: se mira su semana laboral, no solo las filas que hay.
  const esEvento = fila.quotationId !== null;
  const conTurnoDeRestaurante = (p: Persona) =>
    p.default_kind === "planta" && !(p.days_off ?? []).includes(diaSemana);

  const disponibles: SelectOption[] = personas
    .filter(
      (p) =>
        p.status === "activa" &&
        !puestos.has(p.id) &&
        !ocupados.has(p.id) &&
        !(esEvento && conTurnoDeRestaurante(p)) &&
        (!soloPlantaDeEsteCargo ||
          (p.default_kind === "planta" &&
            (p.default_role_id ?? 0) === fila.cargoId)),
    )
    .map((p) => ({
      value: String(p.id),
      label: p.name,
      group:
        p.default_kind === "planta" ? "Personal de planta" : "Personal Staff",
      hint: p.management_resources?.name,
      // En el RESTAURANTE, poner a alguien en su día libre se puede pero
      // a sabiendas (a veces se le paga aparte). En un evento no hace
      // falta el chip: la planta que aparece está libre por definición.
      chip:
        !esEvento && p.days_off?.includes(diaSemana)
          ? { texto: "libre este día", clases: "bg-amber-100 text-amber-800" }
          : undefined,
    }))
    .sort((a, b) => {
      if (a.group !== b.group) return a.group === "Personal de planta" ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

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

      {asignados.length > 0 && (
        <ul className="space-y-1.5">
          {asignados.map((a) => (
            <li key={a.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-gray-900">{a.people?.name ?? "—"}</span>
              {/* El tipo es una ETIQUETA, no un botón (Felipe, 15-08:
                  "tampoco se nota que se puede cambiar"). Lo que sí se
                  toca es el monto, que ahora está SIEMPRE — así se le
                  puede pagar un día suelto a alguien de planta sin
                  cambiarle el tipo. */}
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${chipTipoPersona(a.kind)}`}
              >
                {etiquetaTipoPersona(a.kind)}
              </span>
              <span className="flex-1" />
              {/* LA PLANTA NO LLEVA MONTO EN SU JORNADA (Felipe,
                  15-08): su sueldo ya la cubre. La caja aparece solo
                  donde el día SÍ se paga —el staff, y el planta que
                  viene a un evento, que ese día entra como freelance. */}
              {a.kind === "planta" ? (
                <span className="w-24" />
              ) : (
                <div className="w-24 relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
                    $
                  </span>
                  <NumberInput
                    value={a.amount ?? undefined}
                    onChange={(v: number | undefined) =>
                      onCambiar(a.id, { amount: v ?? null })
                    }
                    placeholder="0"
                    aria-label={`Monto del día de ${a.people?.name ?? "la persona"}`}
                    className={`w-full border rounded-lg pl-5 pr-2 py-1 text-sm text-right ${
                      !a.amount
                        ? "border-amber-400 bg-amber-50"
                        : "border-gray-300"
                    }`}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  // Sin monto no se confirma: el backend lo rechaza
                  // igual, pero acá se dice antes de intentarlo.
                  if (
                    a.status !== "confirmado" &&
                    a.kind !== "planta" &&
                    !a.amount
                  ) {
                    toast.warn("Ponle el monto del día antes de confirmarla.");
                    return;
                  }
                  onCambiar(a.id, {
                    status:
                      a.status === "confirmado" ? "por_confirmar" : "confirmado",
                  });
                }}
                className={`text-xs px-2 py-1 rounded ${
                  a.status === "confirmado"
                    ? "text-emerald-700 hover:bg-emerald-50"
                    : "text-amber-700 hover:bg-amber-50"
                }`}
              >
                {a.status === "confirmado" ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> confirmada
                  </span>
                ) : (
                  "por confirmar"
                )}
              </button>
              {/* EL MINI CALENDARIO: en la PLANTA se marca y se mueve
                  (15-08). En un EVENTO se abre de SOLO LECTURA (Felipe,
                  17-08: "tampoco puedo ver su calendario desde la
                  sección eventos") — se ve en qué anda la persona ese
                  mes, pero los días de evento se cambian en la
                  planificación del evento, como se acordó el 15-08. */}
              {a.person_id != null && (
                <button
                  type="button"
                  onClick={() => setMoviendo(moviendo === a.id ? null : a.id)}
                  title={
                    fila.quotationId === null
                      ? "Marcar en qué días viene"
                      : "Ver en qué anda ese mes"
                  }
                  aria-label={`Días de ${a.people?.name ?? "la persona"}`}
                  className={`p-1 rounded ${
                    moviendo === a.id
                      ? "text-blue-700 bg-blue-50"
                      : "text-gray-400 hover:text-blue-700 hover:bg-blue-50"
                  }`}
                >
                  <CalendarDays className="w-4 h-4" />
                </button>
              )}
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
            {moviendo === a.id && a.person_id != null && (
              <MiniCalendario
                dias={dias}
                persona={personas.find((p) => p.id === a.person_id) ?? null}
                diasQueViene={diasDePlanta(a.person_id)}
                asignaciones={todoElStaff.filter(
                  (s) => s.person_id === a.person_id,
                )}
                diasEnEvento={diasEnEvento(a.person_id)}
                soloLectura={fila.quotationId !== null}
                onMarcar={(d) => onPonerEnDia(a.person_id!, d)}
                onDesmarcar={(d) => onSacarDelDia(a.person_id!, d)}
                onCerrar={() => setMoviendo(null)}
              />
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

      {/* El buscador va ABAJO (Felipe, 15-08): arriba la gente que ya
          está, para que la lista desplegada no la tape. */}
      <AgregadorDeItems
        opciones={disponibles}
        onAgregar={(v) => onPoner(Number(v))}
        abierto={abierto}
        onAbiertoChange={setAbierto}
        placeholder={
          disponibles.length === 0
            ? "Nadie disponible ese día"
            : soloPlantaDeEsteCargo
              ? `Traer a alguien de planta de ${fila.cargo}…`
              : "Buscar y poner a alguien…"
        }
      />
      {esEvento && disponibles.length === 0 && (
        <p className="text-xs text-amber-700">
          Todos están ocupados ese día: en el restaurante, en otro evento o
          ya en esta casilla. Solo se ofrece gente disponible.
        </p>
      )}

      <p className="text-xs text-gray-500">
        {soloPlantaDeEsteCargo ? (
          <>
            Acá se administra la <strong>jornada de la planta</strong>: su
            horario y en qué días viene. Para traer a alguien de fuera —o a
            un planta en otro cargo— está <strong>Personal Staff</strong>.
          </>
        ) : (
          <>
            El tipo y el monto son <strong>de este día</strong>: cambiarlos
            acá no toca la ficha de la persona. Un planta que viene a un
            evento se marca freelance y esa jornada sí se paga.
          </>
        )}
      </p>
      </div>
    </Modal>
  );
}
