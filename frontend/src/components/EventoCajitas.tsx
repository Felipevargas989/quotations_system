// LAS CAJITAS DEL EVENTO (04-08-2026, diseño de Felipe): una sola
// pieza para la ficha del negocio Y la ficha de Post-Venta — Tipo ·
// Fecha (editable, con verificación de choques del cotizador) ·
// Personas (adultos/niños) · Monto (en Post-Venta lleva también
// pagado y saldo). "No tantas reglas, no tantas vistas, no tantas
// cajas": se replica todo y queda coherente.
import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "./toast/Toast";
import {
  checkConflictsWithExistingQuotations,
  updateQuotation,
} from "../services/quotations.service";
import { formatISOUTCDateToString } from "../utils/dates";

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const aYmd = (v: string | Date | null | undefined) =>
  v ? String(v).slice(0, 10) : "";

export default function EventoCajitas({
  quotationId,
  tipo,
  fechaInicio,
  fechaFin,
  adultos,
  ninos,
  monto,
  pagado,
  saldo,
  onFechaGuardada,
  // Quien no puede editar la cotización tampoco le mueve la fecha: el
  // servidor rechaza el PATCH con 403 (12-08). Por omisión SÍ se puede,
  // que es como la monta Post-Venta.
  puedeEditarFecha = true,
}: {
  readonly quotationId: string;
  readonly tipo: string;
  readonly fechaInicio: string | Date;
  readonly fechaFin?: string | Date | null;
  readonly adultos: number;
  readonly ninos: number;
  readonly monto: number;
  // Solo Post-Venta: la caja de monto lleva la plata viva.
  readonly pagado?: number;
  readonly saldo?: number;
  readonly onFechaGuardada: () => void;
  readonly puedeEditarFecha?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [inicio, setInicio] = useState(aYmd(fechaInicio));
  const [fin, setFin] = useState(aYmd(fechaFin));
  const [choca, setChoca] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const abrir = () => {
    setInicio(aYmd(fechaInicio));
    setFin(aYmd(fechaFin));
    setChoca(false);
    setEditando(true);
  };

  // La misma verificación del cotizador: advierte, no bloquea (los
  // dobles eventos deliberados existen en el rubro).
  const revisarChoques = async (i: string, f: string) => {
    if (!i) return;
    try {
      const { data } = await checkConflictsWithExistingQuotations(
        i,
        f || undefined,
        // EXCEPTO YO (Felipe, 21-08): sin esto, la #460 chocaba consigo
        // misma al editarle la fecha.
        quotationId,
      );
      setChoca(Boolean(data?.has_conflicts));
    } catch {
      setChoca(false);
    }
  };

  const guardar = async () => {
    if (!inicio || guardando) return;
    setGuardando(true);
    try {
      const { error } = await updateQuotation(
        {
          event_date: inicio,
          event_end_date: fin && fin !== inicio ? fin : null,
        } as never,
        quotationId,
      );
      if (error) throw new Error(error.message);
      toast.success(
        "Fecha actualizada. Ojo: las cuotas del plan de pagos y los " +
          "servicios de temporada no se mueven solos.",
        { sticky: false },
      );
      setEditando(false);
      onFechaGuardada();
    } catch (error) {
      toast.error(
        `No se pudo cambiar la fecha: ${
          error instanceof Error ? error.message : "error desconocido"
        }`,
      );
    } finally {
      setGuardando(false);
    }
  };

  const multiDia =
    fechaFin && aYmd(fechaFin) !== aYmd(fechaInicio) ? aYmd(fechaFin) : null;

  return (
    <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 px-6 py-4 border-b border-gray-200">
      <div className="border border-gray-200 rounded-xl px-4 py-3">
        <p className="text-xs text-gray-500">Tipo de evento</p>
        <p className="text-lg font-bold text-gray-900 truncate">
          {tipo || "—"}
        </p>
      </div>

      <div className="border border-gray-200 rounded-xl px-4 py-3 relative">
        <p className="text-xs text-gray-500">Fecha del evento</p>
        {editando ? (
          <div className="space-y-1.5 mt-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <input
                type="date"
                value={inicio}
                onChange={(e) => {
                  setInicio(e.target.value);
                  void revisarChoques(e.target.value, fin);
                }}
                className="px-2 py-1 border border-gray-300 rounded-lg"
              />
              <span className="text-gray-400">al</span>
              <input
                type="date"
                value={fin}
                min={inicio}
                onChange={(e) => {
                  setFin(e.target.value);
                  void revisarChoques(inicio, e.target.value);
                }}
                className="px-2 py-1 border border-gray-300 rounded-lg"
                title="Fecha de término (igual al inicio = un solo día)"
              />
            </div>
            {choca && (
              <p className="text-xs text-amber-700">
                ⚠ Ese día ya tiene eventos agendados.
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={!inicio || guardando}
                className="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-lg font-bold text-gray-900">
              {formatISOUTCDateToString(fechaInicio as Date)}
            </p>
            {multiDia && (
              <p className="text-xs text-gray-500">
                al {formatISOUTCDateToString(multiDia as unknown as Date)}
              </p>
            )}
            {puedeEditarFecha && (
              <button
                type="button"
                onClick={abrir}
                className="absolute top-2.5 right-2.5 text-gray-300 hover:text-gray-500"
                title="Cambiar la fecha del evento"
              >
                <Pencil size={14} />
              </button>
            )}
          </>
        )}
      </div>

      <div className="border border-gray-200 rounded-xl px-4 py-3">
        <p className="text-xs text-gray-500">Personas</p>
        <p className="text-lg font-bold text-gray-900">{adultos + ninos}</p>
        <p className="text-xs text-gray-500">
          {ninos > 0 ? `${adultos} adultos + ${ninos} niños` : "todos adultos"}
        </p>
      </div>

      <div className="border border-gray-200 rounded-xl px-4 py-3">
        <p className="text-xs text-gray-500">Monto total</p>
        <p className="text-lg font-bold text-gray-900">{clp(monto)}</p>
        {pagado !== undefined && saldo !== undefined && (
          <p className="text-xs">
            <span className="text-green-600 font-semibold">
              Pagado {clp(pagado)}
            </span>{" "}
            ·{" "}
            <span
              className={`font-semibold ${saldo > 0 ? "text-yellow-600" : "text-green-600"}`}
            >
              Saldo {clp(saldo)}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
