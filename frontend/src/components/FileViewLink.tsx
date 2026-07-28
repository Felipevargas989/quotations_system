import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download } from "lucide-react";
import { resolveStorageUrl } from "../services/storage.service";

// Enlace "Ver" + visor compartido de archivos (comprobantes, documentos,
// reembolsos): la imagen se muestra en una ventana sobre la página, y los
// PDF usan el visor nativo del navegador (páginas, zoom y búsqueda).
// Única acción extra dentro del visor: Descargar (definición de Felipe,
// 20-07-2026 — sin "abrir en pestaña nueva").
// Misión storage (28-07): el balde de comprobantes es PRIVADO — al abrir,
// el visor pide al backend un enlace firmado que caduca en minutos.
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
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  // El tipo se decide con lo GUARDADO (ruta o URL vieja), no con el
  // enlace firmado (que trae parámetros al final).
  const isPdf = url.split("?")[0].toLowerCase().endsWith(".pdf");

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setViewUrl(null);
    resolveStorageUrl(url)
      .then((firmada) => vivo && setViewUrl(firmada))
      .catch(() => vivo && setViewUrl(null));
    return () => {
      vivo = false;
    };
  }, [open, url]);

  const downloadUrl = viewUrl
    ? viewUrl.includes("?")
      ? `${viewUrl}&download=`
      : `${viewUrl}?download=`
    : null;

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
                  {downloadUrl && (
                    <a
                      href={downloadUrl}
                      className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800"
                    >
                      <Download size={15} /> Descargar
                    </a>
                  )}
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
              {!viewUrl ? (
                <div className="flex items-center justify-center h-40 text-sm text-gray-500">
                  Preparando el archivo…
                </div>
              ) : isPdf ? (
                <iframe
                  src={viewUrl}
                  title={title || "Documento"}
                  className="w-full h-[82vh]"
                />
              ) : (
                <div className="overflow-auto flex items-center justify-center bg-gray-50 p-4">
                  <img
                    src={viewUrl}
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
