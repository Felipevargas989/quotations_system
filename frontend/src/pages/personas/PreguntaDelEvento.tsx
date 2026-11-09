import Modal from "../../components/Modal";
import type { Persona } from "../../types/people.types";

/**
 * EL SEGURO DE STAFF (Felipe, 09-11-2026: "ok me parece con seguro").
 *
 * Camila empezó a poner la gente de los eventos en Personal Staff: el
 * 29-10, David Iturra (garzón) quedó en Staff y no en la #460, que no
 * aparecía en la sábana. Lo que va en Staff no llega al costo del evento,
 * y en la liquidación de la #460 le pusieron otro monto a su fila de
 * invitado — se le podía pagar dos veces.
 *
 * Por eso, al poner a alguien en Personal Staff un día que tiene evento,
 * la casilla pregunta para dónde va, como en la maqueta aprobada:
 *
 *   Ese día hay evento
 *   ¿Va para un evento?   [Para la #460 · …]  [Para la #616 · …]
 *                         [No, es staff del día]
 *
 * Si es para un evento, va a ese evento con el cargo de su fila, y la
 * casilla salta a la del evento para ponerle el monto ahí. Si no, sigue
 * como siempre (y si es un planta en un día que no le toca, viene la
 * pregunta del día extra).
 */

export interface EventoDeLaPregunta {
  readonly id: string;
  readonly numero: number;
  readonly cliente: string;
}

const rotuloLargo = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

export default function PreguntaDelEvento({
  persona,
  cargo,
  dia,
  eventos,
  onEvento,
  onStaff,
  onCerrar,
}: {
  readonly persona: Persona;
  readonly cargo: string;
  readonly dia: string;
  readonly eventos: readonly EventoDeLaPregunta[];
  readonly onEvento: (quotationId: string) => void;
  readonly onStaff: () => void;
  readonly onCerrar: () => void;
}) {
  return (
    <Modal titulo="Ese día hay evento" ancho="max-w-md" onCerrar={onCerrar}>
      <div className="space-y-3">
        <p className="text-sm text-gray-700">
          Vas a poner a {persona.name}
          {cargo ? ` (${cargo.toLowerCase()})` : ""} en Staff el{" "}
          {rotuloLargo(dia)}. <strong>¿Va para un evento?</strong>
        </p>
        {eventos.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onEvento(e.id)}
            className="w-full text-left border border-emerald-300 rounded-lg px-3 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
          >
            Para la #{e.numero} · {e.cliente}
          </button>
        ))}
        <button
          type="button"
          onClick={onStaff}
          className="w-full text-left border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-medium text-violet-800 hover:border-violet-400 hover:bg-violet-50"
        >
          No, es staff del día
        </button>
      </div>
    </Modal>
  );
}
