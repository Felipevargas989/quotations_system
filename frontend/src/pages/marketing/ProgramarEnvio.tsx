import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Send } from "lucide-react";
import Modal from "../../components/Modal";
import { HoraInput } from "../../components/inputs";
import { toast } from "../../components/toast/Toast";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  cancelarProgramacion,
  programarCampana,
  recomendacionHorario,
  type CampanaMarketing,
} from "../../services/marketing.service";

/**
 * PROGRAMAR ENVÍO (Felipe, 04-09 — capítulo "Programar envío" del
 * doc 11). El botón abre la ventana con fecha y hora — y la
 * RECOMENDACIÓN DE HORARIO POR AUDIENCIA (regla de Felipe): con
 * historial propio manda el dato ("tus correos a esta audiencia se
 * abren más los martes 18–20 h"); sin historial, los estudios según
 * el público — oficina en la mañana, casa en la tarde.
 *
 * La campaña programada la despacha el reloj del motor (Railway,
 * 24/7): no depende de ningún computador encendido. Programar exige
 * la misma prueba obligatoria que enviar; mientras espera queda
 * no-editable, y cancelar la devuelve a borrador sin perder nada.
 */

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }) +
  ", " +
  new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });

/** El botón "Programar envío" del borrador, con su ventana. */
export function BotonProgramar({
  campanaId,
  conPrueba,
  onCambio,
}: {
  readonly campanaId: number;
  /** Sin prueba no hay envío — programar exige lo mismo. */
  readonly conPrueba: boolean;
  readonly onCambio: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState<string | null>("10:00");

  const recomendaciones = useQuery({
    queryKey: ["marketing", "recomendacion-horario", campanaId],
    queryFn: () => recomendacionHorario(campanaId),
    enabled: abierto,
    staleTime: 5 * 60_000,
  });

  const programar = useMutation({
    mutationFn: (cuando: string) => programarCampana(campanaId, cuando),
    onSuccess: (c) => {
      toast.success(
        `Campaña programada para el ${fechaLarga(c.programada_para ?? "")}.`,
      );
      setAbierto(false);
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const cuando =
    fecha && hora ? new Date(`${fecha}T${hora}:00`) : null;
  const enElFuturo = !!cuando && cuando.getTime() > Date.now() + 60_000;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={!conPrueba}
        title={
          conPrueba
            ? undefined
            : "Primero mándate la prueba: sin prueba no hay envío"
        }
        className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        <CalendarClock className="w-3.5 h-3.5" /> Programar envío
      </button>

      {abierto && (
        <Modal
          titulo="Programar el envío"
          subtitulo="Sale sola a la hora dicha — el reloj corre en el servidor, no en tu computador"
          ancho="max-w-md"
          onCerrar={() => setAbierto(false)}
        >
          <div className="space-y-4">
            {/* La recomendación, POR AUDIENCIA */}
            <div className="space-y-1.5">
              {recomendaciones.data?.map((r) => (
                <p
                  key={r.rotulo}
                  className="text-xs bg-blue-50 text-blue-900 rounded-lg px-3 py-2"
                >
                  <span className="font-semibold">{r.rotulo}</span>
                  {": "}
                  {r.texto}{" "}
                  <span className="text-blue-400">
                    {r.fuente === "datos"
                      ? "(medido de tus campañas)"
                      : "(estudios de la industria)"}
                  </span>
                </p>
              ))}
              {recomendaciones.isLoading && (
                <p className="text-xs text-gray-400">
                  Buscando el mejor horario…
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={fecha}
                min={new Date().toLocaleDateString("en-CA")}
                onChange={(e) => setFecha(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                aria-label="Fecha del envío"
              />
              <span className="text-xs text-gray-400">a las</span>
              <HoraInput
                value={hora}
                onChange={setHora}
                compacta
                aria-label="Hora del envío"
              />
            </div>
            {fecha && hora && !enElFuturo && (
              <p className="text-xs text-amber-700">
                Esa hora ya pasó (o está encima): elige un momento futuro.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!enElFuturo || programar.isPending}
                onClick={() =>
                  cuando && programar.mutate(cuando.toISOString())
                }
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {programar.isPending ? "Programando…" : "Programar"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/** La caja de una campaña PROGRAMADA: cuándo sale, cancelar, o no
 *  esperar al reloj y despacharla ahora. */
export function CajaProgramada({
  campana,
  onCambio,
  onEnviarAhora,
}: {
  readonly campana: CampanaMarketing;
  readonly onCambio: () => void;
  readonly onEnviarAhora: () => void;
}) {
  const [cancelando, setCancelando] = useState(false);
  const cancelar = useMutation({
    mutationFn: () => cancelarProgramacion(campana.id),
    onSuccess: () => {
      toast.success("Programación cancelada: la campaña volvió a borrador.");
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  return (
    <div className="bg-white rounded-xl border border-blue-200 p-4 flex items-center gap-3 flex-wrap">
      <CalendarClock className="w-5 h-5 text-blue-600 shrink-0" />
      <p className="text-sm text-gray-700 flex-1 min-w-[220px]">
        Programada para el{" "}
        <span className="font-semibold">
          {campana.programada_para ? fechaLarga(campana.programada_para) : "—"}
        </span>
        . Sale sola a esa hora; para editarla, primero cancela la
        programación.
      </p>
      {cancelando ? (
        <span className="flex items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => cancelar.mutate()}
            disabled={cancelar.isPending}
            className="px-2.5 py-1.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            Sí, cancelar
          </button>
          <button
            type="button"
            onClick={() => setCancelando(false)}
            className="px-2.5 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            No
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setCancelando(true)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          Cancelar programación
        </button>
      )}
      <button
        type="button"
        onClick={onEnviarAhora}
        className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white hover:bg-black"
      >
        <Send className="w-3.5 h-3.5" /> Enviar ahora
      </button>
    </div>
  );
}
