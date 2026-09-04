import { useState } from "react";
import Modal from "../../components/Modal";
import {
  NumberInput,
  formatoHoras,
  horasTrabajadas,
} from "../../components/inputs";
import { horarioHabitual } from "./MiniCalendario";
import type { Asignacion, Persona } from "../../types/people.types";

/**
 * LA PREGUNTA DEL DÍA EXTRA (Felipe, 04-09 — capítulo 11 de la
 * arquitectura de Personas).
 *
 * Nació del caso Alejandra/Soledad: un cambio de turnos terminó con la
 * propina en la persona equivocada porque dos reglas automáticas e
 * invisibles decidían por él. Sus palabras: "creo que las reglas están
 * mal, quizás es más fácil preguntar… así se simplifica la forma".
 *
 * Al poner a alguien DE PLANTA en un día que no le corresponde —su día
 * libre, o con un cargo que no es el suyo—, desde cualquier puerta del
 * restaurante (la ficha de la persona o el calendario de
 * Planificación), el sistema deja de adivinar y pregunta:
 *
 *   ¿Este día va como planta o como freelance?
 *
 * - PLANTA: sin monto — su sueldo cubre el día, y las horas de más se
 *   pagan a fin de mes como Felipe decida. Nace confirmada.
 * - FREELANCE: se muestra la advertencia de horas (las que queda
 *   sumando esta semana contra las de su jornada definida) y el monto
 *   del día es OBLIGATORIO. Nace por confirmar.
 *
 * Los eventos no pasan por acá: ahí el planta traído a mano sigue
 * naciendo freelance con su aviso de pago.
 */

/** El tipo que la puerta manda al guardar, según la respuesta. */
export type EleccionDiaExtra =
  | { kind: "planta" }
  | { kind: "freelance"; amount: number };

const hhmm = (v: string | null | undefined) => v?.slice(0, 5) ?? null;

/**
 * ¿Es un día que no le corresponde? Gemelo (para el restaurante) de
 * `esJornadaExtra` en api-rest/src/people/people.service.ts: persona de
 * planta en su día libre, o con un cargo que no es el suyo. Es el
 * detector de CUÁNDO preguntar — ya no decide el tipo por sí solo.
 */
export const esDiaExtra = (
  persona: Persona | null | undefined,
  dia: string,
  roleId?: number | null,
): boolean => {
  if (!persona || persona.default_kind !== "planta") return false;
  const libre = (persona.days_off ?? []).includes(
    new Date(`${dia}T00:00:00Z`).getUTCDay(),
  );
  const cargoAjeno =
    roleId != null &&
    persona.default_role_id != null &&
    roleId !== persona.default_role_id;
  return libre || cargoAjeno;
};

const diaMas = (iso: string, n: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

const horasHabituales = (persona: Persona, dia: string) => {
  const h = horarioHabitual(persona, dia);
  return horasTrabajadas(h.in, h.out, h.break) ?? 0;
};

const rotuloLargo = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

export default function PreguntaDiaExtra({
  persona,
  dia,
  jornadas,
  roleId,
  onElegir,
  onCerrar,
}: {
  readonly persona: Persona;
  readonly dia: string;
  /** Sus jornadas del rango cargado, para sumar la semana del día. */
  readonly jornadas: readonly Asignacion[];
  /** El cargo con que viene, si la puerta impone uno (Planificación). */
  readonly roleId?: number | null;
  readonly onElegir: (eleccion: EleccionDiaExtra) => void;
  readonly onCerrar: () => void;
}) {
  const [comoFreelance, setComoFreelance] = useState(false);
  const [monto, setMonto] = useState<number | undefined>(undefined);

  // LA ADVERTENCIA DE HORAS: con este día, cuántas queda sumando esa
  // semana (domingo a sábado) contra las de su jornada definida en la
  // ficha. Con eso se decide: ajustar su semana en su calendario,
  // dejarlo de planta, o seguir freelance con monto.
  const d0 = new Date(`${dia}T00:00:00Z`);
  const domingo = diaMas(dia, -d0.getUTCDay());
  const semana = [0, 1, 2, 3, 4, 5, 6].map((n) => diaMas(domingo, n));
  const horasSemana =
    jornadas
      .filter((a) => {
        const d = String(a.day).slice(0, 10);
        return (
          d >= semana[0] &&
          d <= semana[6] &&
          d !== dia &&
          a.ajuste !== "descansa" &&
          !a.solo_propina
        );
      })
      .reduce((t, a) => {
        const hab = horarioHabitual(persona, String(a.day).slice(0, 10));
        return (
          t +
          (horasTrabajadas(
            hhmm(a.starts_at) ?? hab.in,
            hhmm(a.ends_at) ?? hab.out,
            a.break_minutes ?? hab.break,
          ) ?? 0)
        );
      }, 0) + horasHabituales(persona, dia);
  const horasDefinidas = semana.reduce((t, d) => {
    const dw = new Date(`${d}T00:00:00Z`).getUTCDay();
    if ((persona.days_off ?? []).includes(dw)) return t;
    return t + horasHabituales(persona, d);
  }, 0);
  const pasado = horasSemana > horasDefinidas;

  const libre = (persona.days_off ?? []).includes(d0.getUTCDay());

  return (
    <Modal
      titulo="Un día que no le corresponde"
      subtitulo={`${persona.name} · ${rotuloLargo(dia)}`}
      ancho="max-w-md"
      onCerrar={onCerrar}
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-700">
          {libre
            ? "Es su día libre."
            : "Viene con un cargo que no es el suyo."}{" "}
          <strong>¿Este día va como planta o como freelance?</strong>
        </p>

        <button
          type="button"
          onClick={() => onElegir({ kind: "planta" })}
          className="w-full text-left border border-gray-300 rounded-lg px-3 py-2.5 hover:border-violet-400 hover:bg-violet-50"
        >
          <span className="block text-sm font-semibold text-gray-900">
            De planta
          </span>
          <span className="block text-xs text-gray-500">
            Sin monto: su sueldo cubre el día, y si queda con horas de más
            se pagan a fin de mes.
          </span>
        </button>

        <button
          type="button"
          onClick={() => setComoFreelance(true)}
          className={`w-full text-left border rounded-lg px-3 py-2.5 ${
            comoFreelance
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
          }`}
        >
          <span className="block text-sm font-semibold text-gray-900">
            Freelance
          </span>
          <span className="block text-xs text-gray-500">
            El día se le paga aparte, con su monto.
          </span>
        </button>

        {comoFreelance && (
          <div className="space-y-3 border-t border-gray-200 pt-3">
            <p
              className={`text-xs rounded-lg px-3 py-2 ${
                pasado
                  ? "bg-amber-50 text-amber-900"
                  : "bg-gray-50 text-gray-600"
              }`}
            >
              Con este día queda con{" "}
              <strong>{formatoHoras(horasSemana)}</strong> esta semana; su
              jornada definida es de{" "}
              <strong>{formatoHoras(horasDefinidas)}</strong>.
              {pasado && (
                <>
                  {" "}
                  Si no calza, ajusta su semana en su calendario — o déjalo
                  de planta.
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <div className="w-32 relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
                  $
                </span>
                <NumberInput
                  value={monto}
                  onChange={setMonto}
                  placeholder="0"
                  aria-label="Monto del día"
                  className={`w-full border rounded-lg pl-5 pr-2 py-1.5 text-sm text-right ${
                    !monto ? "border-amber-400 bg-amber-50" : "border-gray-300"
                  }`}
                />
              </div>
              <button
                type="button"
                disabled={!monto || monto <= 0}
                onClick={() =>
                  monto && onElegir({ kind: "freelance", amount: monto })
                }
                className="px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Guardar freelance
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Un día freelance necesita su monto: sin él no se guarda.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
