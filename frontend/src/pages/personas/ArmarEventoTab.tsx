import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Minus, Plus, Search, Trash2, X } from "lucide-react";
import AgregadorDeItems from "../../components/selects/AgregadorDeItems";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import type { SelectOption } from "../../components/selects/types";
import { toast } from "../../components/toast/Toast";
import { getQuotations } from "../../services/quotations.service";
import { QuotationStatus } from "../../types/quotations.types";
import { recursosQueryOpts } from "../postventa/EventResourcesSection";
import {
  addEventResource,
  deleteEventResource,
  updateEventResource,
  type EventResource,
} from "../../services/logistics.service";
import {
  addStaff,
  peopleQueryOptions,
  removeStaff,
  staffQueryOptions,
  updateStaff,
} from "../../services/people.service";
import type { Asignacion, Persona } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { chipTipoPersona, etiquetaTipoPersona } from "../../utils/estadoPersona";
import { formatearRut } from "../../utils/rut";

// ARMAR UN EVENTO — LA MESA DE TRABAJO
//
// Días en las columnas, cargos en las filas. Arriba cuántos TIENES, abajo
// cuántos NECESITAS. Se pincha una casilla y se ponen los nombres.
//
// VIVE ACÁ Y NO EN GESTIÓN por una razón de trabajo, no de orden: Felipe
// no se sienta a llenar el Joker No 1, se sienta el lunes y llena lo que
// viene. Metida dentro de un evento habría que entrar y salir de cada uno.
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

const rotulo = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    dia: d.toLocaleDateString("es-CL", { weekday: "short", timeZone: "UTC" }).replace(".", ""),
    num: d.getUTCDate(),
    mes: d.toLocaleDateString("es-CL", { month: "short", timeZone: "UTC" }).replace(".", ""),
  };
};

const iso = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);

export default function ArmarEventoTab({ companyId }: { readonly companyId: number }) {
  const qc = useQueryClient();
  const [eventoId, setEventoId] = useState("");
  const [casilla, setCasilla] = useState<{ dia: string; cargoId: number } | null>(null);

  // Eventos que valen la pena armar: los cerrados y los ya realizados
  // (estos últimos para cerrarlos y repartir la propina).
  const { data: eventos = [] } = useQuery({
    queryKey: ["people", "eventos-armables"],
    queryFn: async () => {
      const r = (await getQuotations(undefined, [QuotationStatus.ACEPTADA, QuotationStatus.REALIZADA], "event_date", "desc")) as {
        data?: unknown[];
      };
      return ((r?.data ?? r ?? []) as Record<string, unknown>[]).map((q) => ({
        id: String(q.id),
        numero: Number(q.quotation_number),
        cliente: String((q.clients as { name?: string })?.name ?? ""),
        inicio: iso(q.event_date as string),
        termino: iso(q.event_end_date as string),
        estado: String(q.quotation_status),
      }));
    },
  });

  const evento = eventos.find((e) => e.id === eventoId);

  const { data: recursos } = useQuery({
    ...recursosQueryOpts(companyId, eventoId),
    enabled: !!eventoId,
  });
  const { data: staff = [] } = useQuery(staffQueryOptions(eventoId));
  const { data: personas = [] } = useQuery(peopleQueryOptions);

  const refrescar = () =>
    qc.invalidateQueries({ queryKey: ["people", "staff", eventoId] });

  const poner = useMutation({
    mutationFn: (p: { personId: number; dia: string; cargoId: number; monto: number | null }) =>
      addStaff({
        quotation_id: eventoId,
        person_id: p.personId,
        day: p.dia,
        role_id: p.cargoId,
        amount: p.monto,
      }),
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const sacar = useMutation({
    mutationFn: (id: number) => removeStaff(id),
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  // Cuántos NECESITAS ese día. Vive acá y no en Gestión porque Felipe
  // pidió una sola pantalla: "fusionemos la grilla de resumen con donde
  // yo asigno o cargo a las personas".
  const necesitar = useMutation({
    mutationFn: async (p: {
      cargoId: number;
      dia: string;
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
        quotation_id: eventoId,
        resource_id: p.cargoId,
        quantity: p.cantidad,
        price_fixed: p.precio,
        price_per_person: 0,
        day: p.dia,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: recursosQueryOpts(companyId, eventoId).queryKey }),
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const cambiar = useMutation({
    mutationFn: (p: { id: number; cambios: Parameters<typeof updateStaff>[1] }) =>
      updateStaff(p.id, p.cambios),
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const dias = useMemo(
    () => (evento?.inicio ? diasEntre(evento.inicio, evento.termino) : []),
    [evento],
  );

  // Lo que NECESITAS: sale de Recursos, repartido por día.
  const filas = useMemo(() => {
    const lineas = recursos?.lines ?? [];
    const cat = recursos?.resources ?? [];
    const m = new Map<
      number,
      {
        nombre: string;
        precio: number;
        necesita: Map<string, number>;
        lineas: Map<string, EventResource>;
        sinRepartir: number;
      }
    >();
    for (const l of lineas) {
      const r = cat.find((x) => x.id === l.resource_id);
      if (!r || r.type !== "personal") continue;
      if (!m.has(r.id))
        m.set(r.id, {
          nombre: r.name,
          precio: l.price_fixed || Number(r.list_price_fixed) || 0,
          necesita: new Map(),
          lineas: new Map(),
          sinRepartir: 0,
        });
      const f = m.get(r.id)!;
      const d = iso(l.day);
      if (d) {
        f.necesita.set(d, (f.necesita.get(d) || 0) + (l.quantity || 0));
        f.lineas.set(d, l);
      } else f.sinRepartir += l.quantity || 0;
    }
    return [...m.entries()].map(([id, f]) => ({ id, ...f }));
  }, [recursos]);

  // Lo que TIENES: las asignaciones reales.
  const puestos = useMemo(() => {
    const m = new Map<string, Asignacion[]>();
    for (const a of staff) {
      const k = `${iso(a.day)}|${a.role_id ?? 0}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return m;
  }, [staff]);

  const enCasilla = (dia: string, cargoId: number) => puestos.get(`${dia}|${cargoId}`) ?? [];

  const opcionesEvento: SelectOption[] = eventos.map((e) => ({
    value: e.id,
    label: `#${e.numero} · ${e.cliente}`,
    hint: e.inicio
      ? `${e.inicio}${e.termino && e.termino !== e.inicio ? ` al ${e.termino}` : ""}`
      : undefined,
  }));

  const faltan = filas.reduce(
    (s, f) => s + dias.reduce((t, d) => t + Math.max(0, (f.necesita.get(d) || 0) - enCasilla(d, f.id).length), 0),
    0,
  );

  const filaAbierta = casilla ? filas.find((f) => f.id === casilla.cargoId) : null;

  return (
    <div className="space-y-4">
      <div className="sm:w-2/3">
        <SelectWithSearch
          options={opcionesEvento}
          value={eventoId}
          onChange={(v) => {
            setEventoId(v);
            setCasilla(null);
          }}
          placeholder="Elegir el evento a armar"
          searchPlaceholder="Buscar por número o cliente…"
        />
      </div>

      {!eventoId ? (
        <p className="text-center py-16 text-gray-500">
          Elige un evento y arma quién va cada día.
        </p>
      ) : filas.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="mb-1">Este evento todavía no tiene personal costeado.</p>
          <p className="text-sm">
            Se agrega en Post-Venta → el evento → Gestión → Recursos.
          </p>
        </div>
      ) : (
        <>
          {faltan > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Faltan <strong>{faltan}</strong>{" "}
              {faltan === 1 ? "persona" : "personas"} por conseguir.
            </div>
          )}

          <div className="border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-medium text-gray-500 sticky left-0 bg-gray-50">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td className="px-3 py-2 text-gray-900 sticky left-0 bg-white">
                      {f.nombre}
                      {f.sinRepartir > 0 && (
                        <span className="ml-2 text-[11px] text-amber-700">
                          {f.sinRepartir} sin repartir
                        </span>
                      )}
                    </td>
                    {dias.map((d) => {
                      const necesita = f.necesita.get(d) || 0;
                      const tiene = enCasilla(d, f.id).length;
                      const falta = necesita - tiene;
                      const abierta = casilla?.dia === d && casilla?.cargoId === f.id;
                      if (necesita === 0 && tiene === 0)
                        return (
                          <td key={d} className="px-2 py-2 text-center text-gray-200">
                            ·
                          </td>
                        );
                      return (
                        <td key={d} className="px-1 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => setCasilla(abierta ? null : { dia: d, cargoId: f.id })}
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
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {casilla && filaAbierta && (
            <CasillaAbierta
              dia={casilla.dia}
              cargo={filaAbierta}
              asignados={enCasilla(casilla.dia, casilla.cargoId)}
              personas={personas}
              onCerrar={() => setCasilla(null)}
              onPoner={(personId, monto) =>
                poner.mutate({ personId, dia: casilla.dia, cargoId: casilla.cargoId, monto })
              }
              onSacar={(id) => sacar.mutate(id)}
              onCambiar={(id, cambios) => cambiar.mutate({ id, cambios })}
              onNecesitar={(cantidad) =>
                necesitar.mutate({
                  cargoId: filaAbierta.id,
                  dia: casilla.dia,
                  cantidad,
                  linea: filaAbierta.lineas.get(casilla.dia),
                  precio: filaAbierta.precio,
                })
              }
            />
          )}
        </>
      )}
    </div>
  );
}

/** La casilla abierta: quiénes están puestos ese día en ese cargo. */
function CasillaAbierta({
  dia,
  cargo,
  asignados,
  personas,
  onCerrar,
  onPoner,
  onSacar,
  onCambiar,
  onNecesitar,
}: {
  readonly dia: string;
  readonly cargo: {
    id: number;
    nombre: string;
    precio: number;
    necesita: Map<string, number>;
    lineas: Map<string, EventResource>;
  };
  readonly asignados: Asignacion[];
  readonly personas: readonly Persona[];
  readonly onCerrar: () => void;
  readonly onPoner: (personId: number, monto: number | null) => void;
  readonly onSacar: (id: number) => void;
  readonly onCambiar: (id: number, cambios: Parameters<typeof updateStaff>[1]) => void;
  readonly onNecesitar: (cantidad: number) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const r = rotulo(dia);
  const necesita = cargo.necesita.get(dia) || 0;
  const puestos = new Set(asignados.map((a) => a.person_id));

  // Los bloqueados no se ofrecen; los no disponibles tampoco. Ninguno de
  // los dos se borra: siguen en la libreta y en la nómina si se les debe.
  const disponibles: SelectOption[] = personas
    .filter((p) => p.status === "activa" && !puestos.has(p.id))
    .map((p) => ({
      value: String(p.id),
      label: p.name,
      hint: [
        p.management_resources?.name,
        p.default_kind === "planta" ? "planta" : undefined,
        p.rut ? formatearRut(p.rut) : "sin RUT",
      ]
        .filter(Boolean)
        .join(" · "),
    }));

  return (
    <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          {cargo.nombre} · {r.dia} {r.num} de {r.mes}
          <span className="ml-2 text-sm font-normal text-gray-500">
            {asignados.length} de {necesita}
          </span>
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-500">necesito</span>
            <button
              type="button"
              onClick={() => onNecesitar(necesita - 1)}
              disabled={necesita <= 0}
              aria-label="Necesito uno menos"
              className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-5 text-center tabular-nums font-medium">{necesita}</span>
            <button
              type="button"
              onClick={() => onNecesitar(necesita + 1)}
              aria-label="Necesito uno más"
              className="p-1 text-gray-400 hover:text-blue-600"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="p-1 text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {asignados.length > 0 && (
        <ul className="space-y-1.5">
          {asignados.map((a) => (
            <li key={a.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
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
                  `$${Math.round(a.amount ?? cargo.precio).toLocaleString("es-CL")}`
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
                onClick={() => onSacar(a.id)}
                aria-label={`Sacar a ${a.people?.name}`}
                className="p-1 text-gray-300 hover:text-red-600 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AgregadorDeItems
        opciones={disponibles}
        onAgregar={(v) => onPoner(Number(v), cargo.precio || null)}
        abierto={abierto}
        onAbiertoChange={setAbierto}
        placeholder="Buscar y poner a alguien…"
      />

      <p className="text-xs text-gray-500">
        El tipo y el monto son <strong>de este día</strong>: cambiarlos acá no
        toca la ficha de la persona. Un planta que trabaja en su día libre se
        marca freelance y esa jornada sí se paga.
      </p>
    </div>
  );
}
