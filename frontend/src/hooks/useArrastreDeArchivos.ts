import { type DragEvent, useEffect, useRef, useState } from "react";

// ARRASTRAR Y SOLTAR ARCHIVOS, en una sola pieza (17-10-2026). Junta lo
// que se aprendió en los Respaldos comerciales de Seguimiento (06-08 y
// 10-08, pedidos de Felipe):
//  - se enciende solo cuando lo que viene son ARCHIVOS (no un texto o un
//    enlace arrastrado);
//  - lleva un contador de profundidad, así no parpadea al pasar sobre los
//    hijos de la zona (tampoco en Safari);
//  - red de seguridad: un archivo soltado FUERA de la zona no hace que la
//    pestaña navegue al archivo.
// Seguimiento (SeguimientoPanel) todavía lleva su copia a mano: pasarla a
// esta pieza cuando se toque esa pantalla.

type Opciones = {
  /** Mientras está desactivada no se enciende ni recibe (por ejemplo, con
   *  un visor abierto encima: el archivo caería invisible bajo el modal). */
  desactivado?: boolean;
};

export function useArrastreDeArchivos(
  alRecibir: (archivos: File[]) => void,
  { desactivado = false }: Opciones = {},
) {
  const [arrastrando, setArrastrando] = useState(false);
  const profundidad = useRef(0);

  useEffect(() => {
    const frenar = (e: globalThis.DragEvent) => e.preventDefault();
    window.addEventListener("dragover", frenar);
    window.addEventListener("drop", frenar);
    return () => {
      window.removeEventListener("dragover", frenar);
      window.removeEventListener("drop", frenar);
    };
  }, []);

  /** Lo que se reparte sobre el elemento que recibe: `<div {...zona}>`. */
  const zona = {
    onDragEnter: (e: DragEvent) => {
      e.preventDefault();
      if (desactivado || !e.dataTransfer?.types?.includes("Files")) return;
      profundidad.current += 1;
      setArrastrando(true);
    },
    onDragOver: (e: DragEvent) => e.preventDefault(),
    onDragLeave: () => {
      profundidad.current = Math.max(0, profundidad.current - 1);
      if (profundidad.current === 0) setArrastrando(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      profundidad.current = 0;
      setArrastrando(false);
      if (desactivado) return;
      const archivos = Array.from(e.dataTransfer?.files ?? []);
      if (archivos.length > 0) alRecibir(archivos);
    },
  };

  return { arrastrando, zona };
}
