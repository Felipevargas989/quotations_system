import Modal from "../../components/Modal";
import {
  MOTIVOS_DEL_DESCARTE,
  type MotivoDelDescarte,
} from "../../services/decisiones";

// EL PORQUÉ DE UN DESCARTE (decisión 113 del doc 17): el ciclo de
// aprendizaje del semáforo. Felipe eligió el modal: «debería ser un modal
// que aparezca cuando uno pincha el botón». Se abre al apretar «Descartar»
// (en la bandeja, el panel y la ficha) o «Desistir» (en las exigencias):
// elegir un motivo descarta y lo anota en el mismo clic; también se puede
// descartar sin motivo o cancelar.

export default function PorQueDescartas({
  titulo = "¿Por qué la descartas?",
  subtitulo = "Así el semáforo aprende.",
  sinMotivo = "Descartar sin motivo",
  ocupado = false,
  onElegir,
  onCancelar,
}: {
  readonly titulo?: string;
  readonly subtitulo?: string;
  readonly sinMotivo?: string;
  readonly ocupado?: boolean;
  /** null = sin motivo. */
  readonly onElegir: (motivo: MotivoDelDescarte | null) => void;
  readonly onCancelar: () => void;
}) {
  return (
    <Modal
      titulo={titulo}
      subtitulo={subtitulo}
      ancho="max-w-md"
      onCerrar={onCancelar}
      pie={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onElegir(null)}
            className="text-sm text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
          >
            {sinMotivo}
          </button>
          <button
            type="button"
            onClick={onCancelar}
            className="px-3 py-1.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancelar
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {MOTIVOS_DEL_DESCARTE.map((m) => (
          <button
            key={m.valor}
            type="button"
            disabled={ocupado}
            onClick={() => onElegir(m.valor)}
            className="px-3 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {m.etiqueta}
          </button>
        ))}
      </div>
    </Modal>
  );
}
