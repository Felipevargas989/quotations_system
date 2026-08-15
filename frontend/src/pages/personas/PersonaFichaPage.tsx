import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Phone, Trash2 } from "lucide-react";
import ConfirmInline from "../../components/ConfirmInline";
import PageSkeleton from "../../components/PageSkeleton";
import Estrellas from "../../components/Estrellas";
import ChipDeEstado from "../../components/ChipDeEstado";
import IconoWhatsApp from "../../components/IconoWhatsApp";
import { toast } from "../../components/toast/Toast";
import PersonaForm from "./PersonaForm";
import MiniCalendario, { horarioHabitual } from "./MiniCalendario";
import {
  addStaff,
  deletePerson,
  getPerson,
  getStaffSemana,
  removeStaff,
  rolesQueryOptions,
  updatePerson,
  updateStaff,
} from "../../services/people.service";
import type {
  Asignacion,
  Persona,
  PersonaFormData,
} from "../../types/people.types";
import type { EstadoPersona } from "../../utils/estadoPersona";
import { datosParaPagarCompletos } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  ESTADOS_PERSONA,
  chipEstadoPersona,
  chipTipoPersona,
  etiquetaEstadoPersona,
  etiquetaTipoPersona,
} from "../../utils/estadoPersona";
import { hoyEnChile } from "../../utils/dates";
import { formatearRut } from "../../utils/rut";
import { formatPhone, telHref } from "../../utils/phone";

// LA FICHA DE UNA PERSONA — pantalla propia, no una ventanita
//
// Nació el 15-08 porque el formulario dejó de caber: datos, banco, cómo
// trabaja, días, situación y notas ya se salían del modal, y encima
// faltaba lo importante —su calendario y lo que se le debe—. Decisión de
// Felipe: *"¿para qué arreglaremos un modal que desaparecerá?"*.
//
// Tiene dirección propia (/personas/:id), así que se puede dejar abierta
// en una pestaña o pasarle el enlace a alguien.

const domingoDe = (isoDia: string) => {
  const d = new Date(`${isoDia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
};
const sumarDias = (isoDia: string, n: number) =>
  new Date(new Date(`${isoDia}T00:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

const RANGO = 28;

export default function PersonaFichaPage() {
  const { id } = useParams<{ id: string }>();
  const personId = Number(id);
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [pestana, setPestana] = useState<"datos" | "calendario">("datos");
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  const { data: persona, isLoading } = useQuery({
    queryKey: ["people", "ficha", personId],
    queryFn: () => getPerson(personId),
    enabled: Number.isFinite(personId),
  });
  const { data: cargos = [] } = useQuery(rolesQueryOptions);
  // Para la caja "Este mes": cuántos días tiene asignados.
  const domingo = domingoDe(hoyEnChile());
  const { data: staffDelMes = [] } = useQuery({
    queryKey: ["people", "staff-semana", domingo, RANGO],
    queryFn: () => getStaffSemana(domingo, sumarDias(domingo, RANGO - 1)),
  });

  const guardar = useMutation({
    mutationFn: (datos: PersonaFormData) => updatePerson(personId, datos),
    onSuccess: () => {
      setErrorServidor(null);
      toast.success(
        persona?.default_kind === "planta"
          ? "Ficha guardada. Este ajuste se proyecta de hoy en adelante."
          : "Ficha guardada.",
      );
      // La proyección corre en el backend: hay que releer las jornadas.
      void qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e: unknown) => setErrorServidor(humanizeApiError(e)),
  });

  // Eliminar vive ACÁ, no en la lista (Felipe, 15-08): borrar a alguien
  // desde una fila es demasiado fácil de apretar sin querer.
  const borrar = useMutation({
    mutationFn: () => deletePerson(personId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["people"] });
      toast.success("Persona eliminada.");
      navegar("/personas");
    },
    onError: (e: unknown) => {
      setBorrando(false);
      toast.error(humanizeApiError(e));
    },
  });

  // El estado se cambia desde la cabecera: se manda la ficha completa
  // con el status nuevo, para no pisar nada de lo que ya estaba.
  const cambiarEstado = useMutation({
    mutationFn: (status: EstadoPersona) =>
      updatePerson(personId, { ...(persona as Persona), status }),
    onSuccess: () => {
      toast.success("Situación actualizada.");
      void qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const guardarMotivo = useMutation({
    mutationFn: (blocked_reason: string) =>
      updatePerson(personId, {
        ...(persona as Persona),
        blocked_reason: blocked_reason || null,
      }),
    onSuccess: () => {
      toast.success("Motivo guardado.");
      void qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  if (isLoading) return <PageSkeleton />;
  if (!persona) {
    return (
      <div className="p-6">
        <p className="text-gray-500">No existe esa persona.</p>
        <button
          type="button"
          onClick={() => navegar("/personas")}
          className="mt-2 text-blue-700 hover:underline text-sm"
        >
          Volver a Personal
        </button>
      </div>
    );
  }

  const completa = datosParaPagarCompletos(persona);

  const telefonoWsp = (persona.phone ?? "").replace(/\D/g, "");
  const diasEsteMes = staffDelMes.filter(
    (a) => a.person_id === persona.id,
  ).length;

  return (
    <div className="p-4 sm:p-6">
      <button
        type="button"
        onClick={() => navegar("/personas")}
        className="text-sm font-semibold text-blue-600 hover:underline mb-4"
      >
        ← Volver a Personal
      </button>

      {/* LA MISMA TARJETA DE COTIZACIONES (Felipe, 15-08): todo adentro,
          a todo el ancho, con la botonera arriba a la derecha, la fila
          de datos clave y las pestañas dentro de la misma tarjeta. */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">
                  {persona.name}
                </h1>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${chipTipoPersona(
                    persona.default_kind ?? "freelance",
                  )}`}
                >
                  {etiquetaTipoPersona(persona.default_kind ?? "freelance")}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {persona.rut ? formatearRut(persona.rut) : "sin RUT"}
              </p>
              {persona.phone && (
                <a
                  href={telHref(persona.phone)}
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline mt-1"
                >
                  <Phone className="w-4 h-4" />
                  {formatPhone(persona.phone)}
                </a>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <ChipDeEstado
                value={persona.status ?? "activa"}
                opciones={ESTADOS_PERSONA.map((e) => ({
                  value: e,
                  label: etiquetaEstadoPersona(e),
                  clases: chipEstadoPersona(e),
                }))}
                onChange={(v) => cambiarEstado.mutate(v as EstadoPersona)}
                titulo="Cambiar su situación"
              />
              {telefonoWsp && (
                <a
                  href={`https://wa.me/${
                    telefonoWsp.length === 9 ? "56" + telefonoWsp : telefonoWsp
                  }`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] text-white text-sm font-semibold hover:brightness-95"
                >
                  <IconoWhatsApp />
                  WhatsApp
                </a>
              )}
              {borrando ? (
                <ConfirmInline
                  question={`¿Eliminar a ${persona.name}?`}
                  yesLabel="Eliminar"
                  tono="peligro"
                  busy={borrar.isPending}
                  onYes={() => borrar.mutate()}
                  onNo={() => setBorrando(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setBorrando(true)}
                  className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                  aria-label={`Eliminar a ${persona.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Bloquear pide motivo: en ocho meses nadie se acuerda de
              por qué. Vive junto al estado, que es donde se bloquea. */}
          {persona.status === "bloqueada" && (
            <div className="mt-3">
              <label
                htmlFor="motivo-bloqueo"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                ¿Por qué está bloqueada?
              </label>
              <input
                id="motivo-bloqueo"
                type="text"
                defaultValue={persona.blocked_reason ?? ""}
                onBlur={(e) => {
                  const motivo = e.target.value.trim();
                  if (motivo !== (persona.blocked_reason ?? "")) {
                    guardarMotivo.mutate(motivo);
                  }
                }}
                placeholder="No llegó a dos eventos seguidos"
                className="w-full sm:w-1/2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Bloquear no impide pagarle lo que ya trabajó.
              </p>
            </div>
          )}

          {!completa && (
            <div className="flex items-start gap-2 mt-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Le faltan datos para poder transferirle. Mejor completarlos
                antes del día de pago.
              </span>
            </div>
          )}

          {/* Las cuatro cajas de datos clave, como en Cotizaciones. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <Caja
              etiqueta="Cargo habitual"
              valor={persona.management_resources?.name ?? "—"}
            />
            <Caja
              etiqueta="Cómo trabaja"
              valor={etiquetaTipoPersona(persona.default_kind ?? "freelance")}
              apunte={
                persona.default_starts_at && persona.default_ends_at
                  ? `${persona.default_starts_at.slice(0, 5)}–${persona.default_ends_at.slice(0, 5)}`
                  : "horario de la casa"
              }
            />
            <Caja
              etiqueta="Evaluación"
              valor={<Estrellas value={null} conNumero />}
            />
            <Caja
              etiqueta="Este mes"
              valor={`${String(diasEsteMes)} ${diasEsteMes === 1 ? "día" : "días"}`}
              apunte="asignados"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 px-6 border-b border-gray-200">
          {(
            [
              ["datos", "Datos"],
              ["calendario", "Su calendario"],
            ] as const
          ).map(([id2, texto]) => (
            <button
              key={id2}
              type="button"
              onClick={() => setPestana(id2)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                pestana === id2
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {texto}
            </button>
          ))}
        </div>

        <div className="p-6">
          {pestana === "datos" ? (
            <PersonaForm
          persona={persona}
          cargos={cargos}
          guardando={guardar.isPending}
          errorServidor={errorServidor}
          onGuardar={(datos) => guardar.mutate(datos)}
          onCancelar={() => navegar("/personas")}
        />
          ) : (
            <CalendarioDePersona persona={persona} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Una de las cajas de datos clave, igual que en Cotizaciones. */
function Caja({
  etiqueta,
  valor,
  apunte,
}: {
  readonly etiqueta: string;
  readonly valor: React.ReactNode;
  readonly apunte?: string;
}) {
  return (
    <div className="border border-gray-200 rounded-lg px-3 py-2">
      <p className="text-xs text-gray-500">{etiqueta}</p>
      <div className="text-base font-semibold text-gray-900 mt-0.5">
        {valor}
      </div>
      {apunte && <p className="text-xs text-gray-400">{apunte}</p>}
    </div>
  );
}

/** El mes de trabajo de esa persona: en qué días viene. */
function CalendarioDePersona({ persona }: { readonly persona: Persona }) {
  const qc = useQueryClient();
  const [domingo, setDomingo] = useState(() => domingoDe(hoyEnChile()));
  const [editandoDia, setEditandoDia] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const avisarGuardado = () => {
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  };

  const dias = useMemo(
    () => Array.from({ length: RANGO }, (_, i) => sumarDias(domingo, i)),
    [domingo],
  );
  const hasta = dias[dias.length - 1];

  const { data: staff = [] } = useQuery({
    queryKey: ["people", "staff-semana", domingo, RANGO],
    queryFn: () => getStaffSemana(domingo, hasta),
  });

  const suyas = staff.filter((a) => a.person_id === persona.id);
  const dePlanta = new Set(
    suyas
      .filter((a) => a.quotation_id === null)
      .map((a) => String(a.day).slice(0, 10)),
  );
  const enEventos = suyas.filter((a) => a.quotation_id !== null);

  const clave = ["people", "staff-semana", domingo, RANGO] as const;
  const refrescar = () => qc.invalidateQueries({ queryKey: clave });

  // MARCAR ES INSTANTÁNEO (Felipe, 15-08: "es lento el asignar días").
  // El día se pinta al toque con una jornada provisoria de id negativo,
  // y el guardado ocurre por detrás. Si falla, se devuelve solo.
  const marcar = useMutation({
    mutationFn: (dia: string) =>
      addStaff({ quotation_id: null, person_id: persona.id, day: dia }),
    onMutate: async (dia: string) => {
      await qc.cancelQueries({ queryKey: clave });
      const antes = qc.getQueryData<Asignacion[]>(clave);
      const hab = horarioHabitual(persona, dia);
      qc.setQueryData<Asignacion[]>(clave, (viejo = []) => [
        ...viejo,
        {
          id: -Date.now(),
          quotation_id: null,
          person_id: persona.id,
          day: dia,
          role_id: persona.default_role_id ?? null,
          kind: persona.default_kind ?? "freelance",
          starts_at: hab.in,
          ends_at: hab.out,
          break_minutes: hab.break,
          status: "confirmado",
          amount: null,
          notes: null,
          tip_amount: null,
          tip_pool_id: null,
          payroll_id: null,
          tip_payroll_id: null,
        } as Asignacion,
      ]);
      return { antes };
    },
    onError: (e: unknown, _dia, ctx) => {
      if (ctx?.antes) qc.setQueryData(clave, ctx.antes);
      toast.error(humanizeApiError(e));
    },
    onSuccess: avisarGuardado,
    onSettled: refrescar,
  });

  const desmarcar = useMutation({
    mutationFn: (dia: string) => {
      const suya = suyas.find(
        (a) => String(a.day).slice(0, 10) === dia && a.quotation_id === null,
      );
      if (!suya || suya.id < 0) throw new Error("Ese día se está guardando");
      return removeStaff(suya.id);
    },
    onMutate: async (dia: string) => {
      await qc.cancelQueries({ queryKey: clave });
      const antes = qc.getQueryData<Asignacion[]>(clave);
      qc.setQueryData<Asignacion[]>(clave, (viejo = []) =>
        viejo.filter(
          (a) =>
            !(
              String(a.day).slice(0, 10) === dia &&
              a.quotation_id === null &&
              a.person_id === persona.id
            ),
        ),
      );
      return { antes };
    },
    onError: (e: unknown, _dia, ctx) => {
      if (ctx?.antes) qc.setQueryData(clave, ctx.antes);
      toast.error(humanizeApiError(e));
    },
    onSuccess: avisarGuardado,
    onSettled: refrescar,
  });

  // El horario de un día suelto, también al toque.
  const cambiarHorario = useMutation({
    mutationFn: (v: {
      dia: string;
      cambios: Parameters<typeof updateStaff>[1];
    }) => {
      const suya = suyas.find(
        (a) => String(a.day).slice(0, 10) === v.dia && a.quotation_id === null,
      );
      if (!suya || suya.id < 0) throw new Error("Ese día se está guardando");
      return updateStaff(suya.id, v.cambios);
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: clave });
      const antes = qc.getQueryData<Asignacion[]>(clave);
      qc.setQueryData<Asignacion[]>(clave, (viejo = []) =>
        viejo.map((a) =>
          String(a.day).slice(0, 10) === v.dia &&
          a.quotation_id === null &&
          a.person_id === persona.id
            ? { ...a, ...v.cambios }
            : a,
        ),
      );
      return { antes };
    },
    onError: (e: unknown, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(clave, ctx.antes);
      toast.error(humanizeApiError(e));
    },
    onSuccess: avisarGuardado,
    onSettled: refrescar,
  });

  const r0 = new Date(`${domingo}T12:00:00Z`);
  const r1 = new Date(`${hasta}T12:00:00Z`);
  const mes = (d: Date) =>
    d.toLocaleDateString("es-CL", { month: "short", timeZone: "UTC" });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDomingo(sumarDias(domingo, -RANGO))}
          className="px-2 py-1 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          ← mes anterior
        </button>
        <span className="text-sm font-semibold text-gray-900">
          {r0.getUTCDate()} {mes(r0)} — {r1.getUTCDate()} {mes(r1)}
        </span>
        <button
          type="button"
          onClick={() => setDomingo(sumarDias(domingo, RANGO))}
          className="px-2 py-1 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          mes siguiente →
        </button>
        <button
          type="button"
          onClick={() => setDomingo(domingoDe(hoyEnChile()))}
          className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          hoy
        </button>
      </div>

      <MiniCalendario
        dias={dias}
        persona={persona}
        diasQueViene={dePlanta}
        asignaciones={suyas}
        diasEnEvento={
          new Set(
            enEventos.map((a) => String(a.day).slice(0, 10)),
          )
        }
        guardado={guardado}
        editando={editandoDia}
        onMarcar={(d) => marcar.mutate(d)}
        onDesmarcar={(d) => desmarcar.mutate(d)}
        onEditar={setEditandoDia}
        onCambiarHorario={(dia, cambios) =>
          cambiarHorario.mutate({ dia, cambios })
        }
      />

      {/* Los días de EVENTO se muestran, pero no se marcan acá: esos
          vienen de la planificación del evento y se cambian allá. */}
      {enEventos.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-1.5">
            Además, en eventos este mes
          </h3>
          <ul className="text-sm text-gray-700 space-y-0.5">
            {enEventos
              .slice()
              .sort((a, b) => String(a.day).localeCompare(String(b.day)))
              .map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <span className="tabular-nums text-gray-500 w-24">
                    {new Date(
                      `${String(a.day).slice(0, 10)}T12:00:00Z`,
                    ).toLocaleDateString("es-CL", {
                      day: "numeric",
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                  <span>{a.management_resources?.name ?? "sin cargo"}</span>
                  <span className="text-xs text-gray-400">
                    {a.starts_at?.slice(0, 5)}–{a.ends_at?.slice(0, 5)}
                  </span>
                </li>
              ))}
          </ul>
          <p className="text-xs text-gray-500 mt-1">
            Los días de evento se cambian en la planificación, no acá.
          </p>
        </section>
      )}
    </div>
  );
}
