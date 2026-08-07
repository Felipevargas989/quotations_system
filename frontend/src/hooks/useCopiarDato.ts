// Copiar un dato al portapapeles con confirmación de dos segundos.
//
// Es SOLO la lógica, sin nada de pantalla: el intento de compartir
// también el diseño se revirtió el 07-08 porque el ícono al lado del
// texto apretujaba la línea. Cada pantalla dibuja el dato a su manera;
// lo que no tiene sentido es que las tres repitan el mismo temporizador.
//
// Antes vivía copiado y pegado en ClientDetailPage, PostVentaPage y
// NegocioPage — y ya habían divergido: dos copiaban el teléfono
// formateado ("+56 9 8425 7069", con espacios que rompen al pegarlo en
// un marcador) y una el número crudo.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "../components/toast/Toast";

export const useCopiarDato = () => {
  const [copiado, setCopiado] = useState<string | null>(null);
  const reloj = useRef<number | null>(null);

  // Si la pantalla se cierra antes de los dos segundos —copiar y salir
  // es un gesto normal— el temporizador no debe quedar vivo.
  useEffect(
    () => () => {
      if (reloj.current) window.clearTimeout(reloj.current);
    },
    [],
  );

  const copiar = useCallback(async (clave: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(clave);
      if (reloj.current) window.clearTimeout(reloj.current);
      reloj.current = window.setTimeout(() => setCopiado(null), 2000);
    } catch {
      // El navegador puede negar el portapapeles (permiso, o página sin
      // HTTPS). Antes se tragaba el error en silencio y uno pegaba lo
      // que tenía de antes sin saber por qué.
      toast.error("El navegador no dejó copiar. Selecciona y copia a mano.");
    }
  }, []);

  return { copiado, copiar };
};
