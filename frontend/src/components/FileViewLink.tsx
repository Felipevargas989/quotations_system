import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Download } from "lucide-react";

// Enlace "Ver" + visor compartido de archivos (comprobantes, documentos,
// reembolsos): la imagen se muestra en una ventana sobre la página, y los
// PDF usan el visor nativo del navegador (páginas, zoom y búsqueda).
// Única acción extra dentro del visor: Descargar (definición de Felipe,
// 20-07-2026 — sin "abrir en pestaña nueva").
export default function FileViewLink({
  url,
  title,
  className = "",
}: {
  readonly url: string;
  readonly title?: string;
  readonly className?: string;
}) {
  const [open, setOpen] = useState(false);
  const isPdf = url.split("?")[0].toLowerCase().endsWith(".pdf");
  // El parámetro download de Supabase Storage fuerza la descarga real
  // (Content-Disposition: attachment) en vez de abrir el archivo.
  const downloadUrl = url.includes("?")
    ? `${url}&download=`
    : `${url}?download=`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-sm font-semibold text-blue-600 hover:text-blue-800 ${className}`}
      >
        Ver
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200">
                <span className="text-sm font-semibold text-gray-900 truncate">
                  {title || "Archivo"}
                </span>
                <div className="flex items-center gap-4 shrink-0">
                  <a
                    href={downloadUrl}
                    className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800"
                  >
                    <Download size={15} /> Descargar
                  </a>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-gray-400 hover:text-gray-600"
                    title="Cerrar"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              {isPdf ? (
                <iframe
                  src={url}
                  title={title || "Documento"}
                  className="w-full h-[82vh]"
                />
              ) : (
                <div className="overflow-auto flex items-center justify-center bg-gray-50 p-4">
                  <img
                    src={url}
                    alt={title || "Comprobante"}
                    className="max-w-full max-h-[80vh] object-contain rounded"
                  />
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
