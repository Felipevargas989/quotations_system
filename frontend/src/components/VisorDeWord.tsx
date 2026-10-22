import { useEffect, useRef, useState } from "react";
import { controlarEnlaces, esEnlaceSeguro } from "../utils/enlacesDelWord";

// EL WORD SE LEE AQUÍ MISMO (decisión 46 del doc 17, 19-10). Felipe:
// "¿tienes algún visor de Word para poder no tener que descargar y abrir un
// Word, sino que poder verlo ahí mismo, el documento, sin tener que
// descargar para firmar? Para poder leerlo y firmar". Lo dibuja
// docx-preview en el navegador (solo .docx; el .doc antiguo se descarga),
// y la librería se baja recién al abrir el primer Word.
//
// Un Word puede venir de afuera (las bases que sube la empresa), así que se
// dibuja AISLADO: dentro de una sombra (shadow DOM), para que sus estilos
// no toquen la página; sin el HTML incrustado que trae a veces un Word
// (`renderAltChunks`, que la librería pone en un iframe con los permisos de
// Eventia), y con los enlaces controlados: solo abren http(s) y correo, en
// otra pestaña.

export default function VisorDeWord({
  url,
  titulo,
}: {
  /** El enlace firmado del archivo. */
  readonly url: string;
  readonly titulo: string;
}) {
  const anfitrion = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">(
    "cargando",
  );

  useEffect(() => {
    const host = anfitrion.current;
    if (!host) return;
    let vivo = true;
    setEstado("cargando");
    const sombra = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    sombra.replaceChildren();
    const estilos = document.createElement("div");
    const cuerpo = document.createElement("div");
    sombra.append(estilos, cuerpo);
    // Un clic en un enlace que se haya colado antes de controlarlos.
    const alClic = (e: Event) => {
      const a = e
        .composedPath()
        .find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement);
      if (!a) return;
      if (!esEnlaceSeguro(a.getAttribute("href") ?? "")) e.preventDefault();
    };
    sombra.addEventListener("click", alClic);
    (async () => {
      try {
        const respuesta = await fetch(url);
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        const datos = await respuesta.blob();
        const { renderAsync } = await import("docx-preview");
        if (!vivo) return;
        await renderAsync(datos, cuerpo, estilos, {
          className: "docx",
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderAltChunks: false,
          renderComments: false,
          renderChanges: false,
        });
        if (!vivo) return;
        controlarEnlaces(sombra);
        setEstado("listo");
      } catch {
        if (vivo) setEstado("error");
      }
    })();
    return () => {
      vivo = false;
      sombra.removeEventListener("click", alClic);
    };
  }, [url]);

  return (
    <div className="relative h-full min-h-[60vh] overflow-auto rounded bg-gray-100">
      {estado !== "listo" && (
        <div className="absolute inset-x-0 top-0 flex items-center justify-center h-40 px-4 text-center text-sm text-gray-500">
          {estado === "cargando"
            ? "Abriendo el Word…"
            : "No se pudo mostrar este Word aquí: descárgalo para verlo."}
        </div>
      )}
      <div ref={anfitrion} aria-label={titulo} role="document" />
    </div>
  );
}
