import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import PageSkeleton from "../../components/PageSkeleton";
import Estrellas from "../../components/Estrellas";
import { toast } from "../../components/toast/Toast";
import PersonaForm from "./PersonaForm";
import MiniCalendario from "./MiniCalendario";
import {
  addStaff,
  getPerson,
  getStaffSemana,
  removeStaff,
  rolesQueryOptions,
  updatePerson,
} from "../../services/people.service";
import type { Persona, PersonaFormData } from "../../types/people.types";
import { datosParaPagarCompletos } from "../../types/people.types";
import { humanizeApiError } from "../../utils/apiErrors";
import { chipTipoPersona, etiquetaTipoPersona } from "../../utils/estadoPersona";
import { hoyEnChile } from "../../utils/dates";
import { formatearRut } from "../../utils/rut";

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

  const { data: persona, isLoading } = useQuery({
    queryKey: ["people", "ficha", personId],
    queryFn: () => getPerson(personId),
    enabled: Number.isFinite(personId),
  });
  const { data: cargos = [] } = useQuery(rolesQueryOptions);

  const guardar = useMutation({
    mutationFn: (datos: PersonaFormData) => updatePerson(personId, datos),
    onSuccess: () => {
      setErrorServidor(null);
      toast.success("Ficha guardada.");
      void qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e: unknown) => setErrorServidor(humanizeApiError(e)),
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

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-start gap-3 mb-4">
        <button
          type="button"
          onClick={() => navegar("/personas")}
          aria-label="Volver a Personal"
          className="p-2 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{persona.name}</h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${chipTipoPersona(
                persona.default_kind ?? "freelance",
              )}`}
            >
              {etiquetaTipoPersona(persona.default_kind ?? "freelance")}
            </span>
            <Estrellas value={null} tamano="sm" />
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {persona.rut ? formatearRut(persona.rut) : "sin RUT"}
            {persona.management_resources?.name && (
              <>
                <span className="mx-1.5 text-gray-300">·</span>
                {persona.management_resources.name}
              </>
            )}
          </p>
        </div>
      </div>

      {!completa && (
        <div className="flex items-start gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Le faltan datos para poder transferirle. Mejor completarlos antes
            del día de pago.
          </span>
        </div>
      )}

      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
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
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              pestana === id2
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

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
  );
}

/** El mes de trabajo de esa persona: en qué días viene. */
function CalendarioDePersona({ persona }: { readonly persona: Persona }) {
  const qc = useQueryClient();
  const [domingo, setDomingo] = useState(() => domingoDe(hoyEnChile()));

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

  const refrescar = () =>
    qc.invalidateQueries({ queryKey: ["people", "staff-semana"] });

  const marcar = useMutation({
    mutationFn: (dia: string) =>
      addStaff({ quotation_id: null, person_id: persona.id, day: dia }),
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const desmarcar = useMutation({
    mutationFn: (dia: string) => {
      const suya = suyas.find(
        (a) =>
          String(a.day).slice(0, 10) === dia && a.quotation_id === null,
      );
      if (!suya) throw new Error("Ese día ya no está");
      return removeStaff(suya.id);
    },
    onSuccess: refrescar,
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
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
        onMarcar={(d) => marcar.mutate(d)}
        onDesmarcar={(d) => desmarcar.mutate(d)}
        onCerrar={() => setDomingo(domingoDe(hoyEnChile()))}
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
