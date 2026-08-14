import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchesSearch } from "../utils/searchMatch";
import { verEnLista } from "../utils/verEnLista";
import type { SelectOption } from "../components/selects/types";

/**
 * LA MECÁNICA DE TODA LISTA CON BUSCADOR
 *
 * Acá vive lo que NO cambia entre una lista plegable y un agregador:
 * filtrar, moverse con el teclado, mantener a la vista lo marcado y
 * cerrarse al pinchar fuera.
 *
 * Existe por una razón concreta: el 13-08-2026 se descubrió que el
 * teclado de la pieza de la casa estaba muerto —el manejador colgaba
 * del botón mientras el foco vivía en el buscador— y que las copias
 * escritas a mano SÍ lo tenían bien. Arreglarlo en un solo lugar no
 * sirve de nada si mañana el agregador escribe su propia versión: sería
 * volver a empezar. Por eso la mecánica es una sola y las dos piezas la
 * usan.
 *
 * Lo que SÍ cambia entre las dos —cómo se ve, dónde se abre, si muestra
 * lo elegido— se queda en cada componente. Este gancho no dibuja nada.
 */

export interface OpcionesListaBuscable {
  readonly opciones: readonly SelectOption[];

  /**
   * Si el buscador también mira el apunte gris (`hint`).
   *
   * En el cotizador el apunte es el PRECIO, y buscar por precio es un
   * accidente indeseado: escribir "500" empezaría a traer platos por lo
   * que cuestan. Por eso el agregador lo apaga.
   */
  readonly buscarEnHint?: boolean;

  /**
   * Si el buscador también mira el nombre de la SECCIÓN (`group`).
   *
   * En los buscadores de ítems sí, y es pedido de Felipe (07-08):
   * escribir "postres" trae toda esa sección aunque ningún plato diga
   * "postre". En los de servicios FIJOS no: ahí nunca se buscó por
   * sección, y encenderlo trae un efecto feo — los fijos sin sección
   * llevan el rótulo literal "Sin sección", así que escribir "sin"
   * traería todos ellos de golpe.
   */
  readonly buscarEnGrupo?: boolean;

  /**
   * Si las flechas dan la vuelta al llegar a los extremos.
   *
   * La lista plegable sí (elegir uno de pocos). El agregador no: sus
   * listas son largas y dar la vuelta desorienta.
   */
  readonly darLaVuelta?: boolean;

  /**
   * Si al escribir queda marcada la PRIMERA fila.
   *
   * Es el flujo de carga rápida: escribir tres letras y apretar Enter
   * sin tocar las flechas. Los agregadores lo necesitan; una lista
   * plegable normal no, porque marcaría algo apenas se abre.
   */
  readonly marcarPrimero?: boolean;

  /** Si la lista está desplegada ahora mismo. */
  readonly abierta: boolean;

  /** Se avisa cuando la lista quiere cerrarse (Escape, clic afuera). */
  readonly alCerrar?: () => void;
}

export function useListaBuscable({
  opciones,
  abierta,
  buscarEnHint = true,
  buscarEnGrupo = true,
  darLaVuelta = true,
  marcarPrimero = false,
  alCerrar,
}: OpcionesListaBuscable) {
  const [texto, setTexto] = useState("");
  const [marcada, setMarcada] = useState(marcarPrimero ? 0 : -1);

  const refRaiz = useRef<HTMLDivElement>(null);
  const refBuscador = useRef<HTMLInputElement>(null);
  const refMarcada = useRef<HTMLButtonElement | null>(null);

  const filtradas = useMemo(
    () =>
      opciones.filter((o) =>
        matchesSearch(
          texto,
          o.label,
          buscarEnHint ? o.hint : undefined,
          buscarEnGrupo ? o.group : undefined,
        ),
      ),
    [opciones, texto, buscarEnHint, buscarEnGrupo],
  );

  /** Deja el buscador vacío y la marca donde corresponda empezar. */
  const reiniciar = useCallback(() => {
    setTexto("");
    setMarcada(marcarPrimero ? 0 : -1);
  }, [marcarPrimero]);

  const alEscribir = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTexto(e.target.value);
      // Al filtrar, la lista cambia entera: la marca vuelve al principio
      // (o a ninguna parte) en vez de quedarse apuntando a una fila que
      // ya no es la misma.
      setMarcada(marcarPrimero ? 0 : -1);
    },
    [marcarPrimero],
  );

  /**
   * La opción marcada se mantiene A LA VISTA — la pillada de Felipe del
   * 07-08. `texto` está en las dependencias a propósito: al filtrar, la
   * marca puede quedarse en el mismo número y sin esto el efecto no
   * volvería a correr, dejando la fila marcada fuera de pantalla.
   */
  useEffect(() => {
    if (marcada >= 0) verEnLista(refMarcada.current);
  }, [marcada, texto]);

  /**
   * TECLADO CON LA LISTA ABIERTA. Va enganchado al BUSCADOR, que es
   * donde vive el foco. Engancharlo al botón que abre fue el bug que
   * dejó 15 pantallas sin teclado durante meses.
   *
   * No maneja Backspace a propósito: cerrar la lista al borrar de más
   * es un comportamiento que ninguna pantalla pidió.
   */
  const teclaEnLista = useCallback(
    (e: React.KeyboardEvent, alElegir: (valor: string) => void) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setMarcada((prev) => {
            if (prev < filtradas.length - 1) return prev + 1;
            return darLaVuelta ? 0 : prev;
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          setMarcada((prev) => {
            if (prev > 0) return prev - 1;
            return darLaVuelta ? filtradas.length - 1 : prev;
          });
          break;
        case "Enter":
          // También evita que Enter envíe el formulario que rodea.
          e.preventDefault();
          if (marcada >= 0 && filtradas[marcada]) {
            alElegir(filtradas[marcada].value);
          }
          break;
        case "Escape":
          e.preventDefault();
          alCerrar?.();
          break;
      }
    },
    [filtradas, marcada, darLaVuelta, alCerrar],
  );

  /**
   * Cierra al pinchar fuera. Se engancha solo cuando la lista está
   * abierta: mientras está cerrada no hay nada que escuchar.
   *
   * Usa `mousedown` y no `click` a propósito — con `click`, un arrastre
   * que empieza dentro de la lista y termina fuera la cerraría.
   */
  useEffect(() => {
    if (!abierta) return;
    const alPinchar = (e: MouseEvent) => {
      if (refRaiz.current && !refRaiz.current.contains(e.target as Node)) {
        alCerrar?.();
      }
    };
    document.addEventListener("mousedown", alPinchar);
    return () => document.removeEventListener("mousedown", alPinchar);
  }, [abierta, alCerrar]);

  /** Al abrir, el foco se va al buscador: se escribe de inmediato. */
  useEffect(() => {
    if (abierta) refBuscador.current?.focus();
  }, [abierta]);

  return {
    texto,
    marcada,
    setMarcada,
    filtradas,
    reiniciar,
    alEscribir,
    teclaEnLista,
    refRaiz,
    refBuscador,
    refMarcada,
  };
}
