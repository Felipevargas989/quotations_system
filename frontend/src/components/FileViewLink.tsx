import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import { resolveStorageUrl } from "../services/storage.service";
import Modal from "./Modal";

// El Word se dibuja con una librería que se baja recién al abrir el primero.
const VisorDeWord = lazy(() => import("./VisorDeWord"));

// Enlace "Ver" + visor compartido de archivos (comprobantes, documentos,
// reembolsos): la imagen se muestra en una ventana sobre la página, y los
// PDF usan el visor nativo del navegador (páginas, zoom y búsqueda).
// Única acción extra dentro del visor: Descargar (definición de Felipe,
// 20-07-2026 — sin "abrir en pestaña nueva").
// Misión storage (28-07): el balde de comprobantes es PRIVADO — al abrir,
// el visor pide al backend un enlace firmado que caduca en minutos.
// 19-10-2026 (decisión 46 del doc 17): también el Word (.docx), dibujado
// aquí mismo (VisorDeWord), y quien lo usa puede sumar acciones junto a
// Descargar (en «Mi postulación», Firmar: leer y firmar sin descargar). Y
// pasó a la ventana de la casa (Modal): Escape cierra y la cabecera queda
// siempre a la vista.

/** Qué se puede ver: el tipo se decide con lo GUARDADO (ruta o URL
 *  vieja), no con el enlace firmado (que trae parámetros al final). */
const claseDe = (url: string): "pdf" | "word" | "imagen" => {
  const limpia = url.split("?")[0].toLowerCase();
  if (limpia.endsWith(".pdf")) return "pdf";
  if (limpia.endsWith(".docx")) return "word";
  return "imagen";
};

export default function FileViewLink({
  url,
  title,
  acciones,
}: {
  readonly url: string;
  readonly title?: string;
  /** Botones junto a Descargar (ej.: Firmar). */
  readonly acciones?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const clase = claseDe(url);

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
  const nombre = title || "Archivo";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-blue-600 hover:text-blue-800"
      >
        Ver
      </button>
      {open &&
        createPortal(
          <Modal
            titulo={<span className="block truncate text-base">{nombre}</span>}
            ancho="max-w-4xl"
            altoFijo
            onCerrar={() => setOpen(false)}
            acciones={
              <div className="flex items-center gap-4 mr-2">
                {acciones}
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800"
                  >
                    <Download size={15} /> Descargar
                  </a>
                )}
              </div>
            }
          >
            {!viewUrl ? (
              <div className="flex items-center justify-center h-40 text-sm text-gray-500">
                Preparando el archivo…
              </div>
            ) : clase === "pdf" ? (
              <iframe
                src={viewUrl}
                title={title || "Documento"}
                className="w-full h-full min-h-[60vh]"
              />
            ) : clase === "word" ? (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-40 text-sm text-gray-500">
                    Abriendo el Word…
                  </div>
                }
              >
                <VisorDeWord url={viewUrl} titulo={nombre} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center bg-gray-50 p-4 rounded">
                <img
                  src={viewUrl}
                  alt={title || "Comprobante"}
                  className="max-w-full max-h-[75vh] object-contain rounded"
                />
              </div>
            )}
          </Modal>,
          document.body,
        )}
    </>
  );
}
