import { X } from "lucide-react";

// Popup simple para ver una foto de referencia en grande: se abre sobre la
// vista actual y se cierra con la ✕ o clic afuera. Sin descargas.
export default function PhotoPopup({
  url,
  title,
  onClose,
}: {
  readonly url: string;
  readonly title?: string;
  readonly onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-6"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="button"
      tabIndex={-1}
      aria-label="Cerrar foto"
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={() => {}}
        role="presentation"
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800 truncate">
            {title || "Foto de referencia"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <img
          src={url}
          alt={title || "Foto de referencia"}
          className="w-full max-h-[70vh] object-contain bg-gray-50"
        />
      </div>
    </div>
  );
}
