import Modal from "../../components/Modal";
import type { Persona } from "../../types/people.types";

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
 * La ventana es MÍNIMA a propósito (segunda vuelta del 04-09): ni
 * monto ni cálculo de horas acá. En este momento todavía no hay
 * jornada definida para el día —no se sabe si vendrá 5, 10 o 12
 * horas—, así que la advertencia de horas vive donde se asignan las
 * horas (AdvertenciaHorasSemana, en los editores de horario). Y el
 * monto del freelance se pone al confirmar la jornada: el candado del
 * 15-08 —sin monto no se confirma— lo exige en pantalla y en el motor.
 *
 * - PLANTA: sin monto; sus horas cuentan en la semana laboral y las de
 *   más se pagan a fin de mes. Nace confirmada.
 * - FREELANCE: acuerdo aparte, no toca su semana. Nace por confirmar.
 *
 * Los eventos no pasan por acá: ahí el refuerzo puesto a mano sigue
 * naciendo freelance con su aviso de pago.
 */

/** El tipo que la puerta manda al guardar, según la respuesta. */
export interface EleccionDiaExtra {
  kind: "planta" | "freelance";
}

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
  onElegir,
  onCerrar,
}: {
  readonly persona: Persona;
  readonly dia: string;
  readonly onElegir: (eleccion: EleccionDiaExtra) => void;
  readonly onCerrar: () => void;
}) {
  const libre = (persona.days_off ?? []).includes(
    new Date(`${dia}T00:00:00Z`).getUTCDay(),
  );

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
            Sin monto: su sueldo cubre el día. Sus horas cuentan en la
            semana, y las de más se pagan a fin de mes.
          </span>
        </button>

        <button
          type="button"
          onClick={() => onElegir({ kind: "freelance" })}
          className="w-full text-left border border-gray-300 rounded-lg px-3 py-2.5 hover:border-blue-400 hover:bg-blue-50"
        >
          <span className="block text-sm font-semibold text-gray-900">
            Freelance
          </span>
          <span className="block text-xs text-gray-500">
            Acuerdo aparte: no toca su semana y el día se paga con su
            monto — se pone al confirmar la jornada.
          </span>
        </button>
      </div>
    </Modal>
  );
}
