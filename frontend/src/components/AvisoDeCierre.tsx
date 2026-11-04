// EL AVISO DE CIERRE (Felipe, 04-11-2026): al marcar una cotización como
// Rechazada, después del motivo, se pregunta «¿Avisarle al cliente?». El
// texto fijo lo arma el motor (con tú, sin la palabra «rechazada») y se
// puede editar antes de enviar. Sale como el correo de la cotización:
// mismo remitente y copia oculta al buzón de respuestas. «No, gracias»
// solo cierra: el estado ya cambió.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Modal from "./Modal";
import { toast } from "./toast/Toast";
import {
  enviarAvisoDeCierre,
  getBorradorDeCierre,
  type BorradorDeCierre,
} from "../services/quotations.service";
import { humanizeApiError } from "../utils/apiErrors";

export default function AvisoDeCierre({
  quotationId,
  onCerrar,
}: {
  readonly quotationId: string;
  readonly onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const [borrador, setBorrador] = useState<BorradorDeCierre | null>(null);
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [enviando, setEnviando] = useState(false);
  // La pantalla pasa una flecha nueva en cada render: el borrador se pide
  // una sola vez por cotización, no cada vez que el padre se repinta.
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;

  useEffect(() => {
    let vivo = true;
    getBorradorDeCierre(quotationId)
      .then((b) => {
        if (!vivo) return;
        setBorrador(b);
        setAsunto(b.asunto);
        setCuerpo(b.cuerpo);
      })
      .catch((e) => {
        // Sin borrador no hay pregunta que hacer: el rechazo ya quedó.
        if (vivo) {
          toast.error(humanizeApiError(e));
          cerrarRef.current();
        }
      });
    return () => {
      vivo = false;
    };
  }, [quotationId]);

  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await enviarAvisoDeCierre(quotationId, { asunto, cuerpo });
      toast.success(`Aviso enviado a ${r.enviado_a}.`);
      void queryClient.invalidateQueries({
        queryKey: ["seguimientos", quotationId],
      });
      onCerrar();
    } catch (e) {
      toast.error(humanizeApiError(e));
    } finally {
      setEnviando(false);
    }
  };

  if (!borrador) return null;
  const sinCorreo = !borrador.para;
  const puede = !sinCorreo && !!asunto.trim() && !!cuerpo.trim() && !enviando;

  return (
    <Modal
      titulo="¿Avisarle al cliente?"
      subtitulo={
        sinCorreo
          ? "El cliente no tiene correo registrado"
          : `Para: ${borrador.para}`
      }
      ancho="max-w-xl"
      bloquearEscape={enviando}
      onCerrar={() => !enviando && onCerrar()}
      pie={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            disabled={enviando}
            className="px-3 py-2 text-sm text-gray-600"
          >
            {sinCorreo ? "Cerrar" : "No, gracias"}
          </button>
          {!sinCorreo && (
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={!puede}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Sí, enviar aviso"}
            </button>
          )}
        </div>
      }
    >
      {sinCorreo ? (
        <p className="text-sm text-gray-700">
          Sin correo no se puede enviar el aviso. Si quieres avisarle, agrega su
          correo en la ficha del cliente.
        </p>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Asunto</span>
            <input
              type="text"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              maxLength={200}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">
              Mensaje
            </span>
            <textarea
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              maxLength={5000}
              rows={13}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed"
            />
          </label>
        </div>
      )}
    </Modal>
  );
}
