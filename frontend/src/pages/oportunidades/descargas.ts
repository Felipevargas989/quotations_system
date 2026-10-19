import { resolveStorageUrl } from "../../services/storage.service";

/** Baja un archivo del balde privado con su nombre original: pide el
 *  enlace firmado y el navegador lo descarga sin salir de la página (el
 *  enlace lleva "download", que pide descargar en vez de mostrar). Para
 *  Excel, ZIP y el .doc antiguo; PDF, imágenes y Word (.docx) también se
 *  ven con FileViewLink. */
export const descargarDelBalde = async (ruta: string, nombre: string) => {
  const url = await resolveStorageUrl(ruta);
  const separador = url.includes("?") ? "&" : "?";
  window.location.assign(
    `${url}${separador}download=${encodeURIComponent(nombre)}`,
  );
};
