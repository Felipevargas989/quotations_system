import { ChevronDown, Search } from "lucide-react";
import { useListaBuscable } from "../../hooks/useListaBuscable";
import type { SelectOption } from "./types";

/**
 * EL AGREGADOR — buscar en un catálogo y SUMAR a una lista
 *
 * No es una lista plegable, aunque se le parezca. Una lista plegable
 * fija UN valor y lo muestra; el agregador suma varios y no muestra
 * ninguno. Las diferencias no son de estilo, son de oficio:
 *
 *   · NUNCA muestra lo último elegido. Orden de Felipe del 04-08:
 *     "ensucia la vista". Tras sumar, el botón vuelve al gris.
 *   · Se queda abierto, con el cursor puesto en el buscador: casi
 *     nunca se agrega una sola cosa.
 *   · Marca la PRIMERA fila al escribir, para el flujo de carga rápida
 *     —tres letras y Enter— sin tocar las flechas.
 *   · Lista alta (hasta 43rem): son catálogos de cientos de platos, no
 *     listas de cinco opciones.
 *   · Se abre SIEMPRE hacia abajo. Nunca hacia arriba: taparía lo que
 *     ya se lleva agregado, que es justo lo que se está mirando.
 *   · Las flechas topan en los extremos en vez de dar la vuelta: en una
 *     lista larga, volver al principio de golpe desorienta.
 *   · El apunte gris NO entra en la búsqueda. Acá el apunte es el
 *     PRECIO, y escribir "500" no debe traer platos por lo que cuestan.
 *
 * Nace de una cuenta concreta: de los 8 commits que en dos meses
 * obligaron a tocar el cotizador Y Post-Venta a la vez, SEIS fueron
 * sobre este mismo agregador —seis cambios en nueve días, cada uno
 * escrito dos y tres veces—. Uno de esos mensajes dice, textual,
 * "selectores pulidos en las TRES casas".
 *
 * Comparte con la lista plegable de la casa toda la mecánica
 * (useListaBuscable): filtrar, teclado, mantener a la vista lo marcado
 * y cerrarse al pinchar fuera. Un arreglo ahí llega a las dos.
 */

export interface AgregadorDeItemsProps {
  readonly opciones: readonly SelectOption[];

  /** Se llama con el valor elegido. Puede repetirse: sumar de nuevo el
   *  mismo ítem es válido (así se sube la cantidad). */
  readonly onAgregar: (valor: string) => void;

  /** Abierto/cerrado lo manda la pantalla: elegir una categoría abre el
   *  agregador de esa caja, "Cancelar" lo cierra, mover o borrar una
   *  caja cierra los que quedaron apuntando a otro lado. */
  readonly abierto: boolean;
  readonly onAbiertoChange: (abierto: boolean) => void;

  /** Texto del botón. Cambia por caja: "Seleccionar servicio de Cena…" */
  readonly placeholder: string;
  readonly searchPlaceholder?: string;
  readonly noResultsText?: string;
  readonly disabled?: boolean;

  /** Tamaño del texto del botón. Las copias no coinciden: los
   *  agregadores de ítems usan el tamaño base y los de servicios fijos
   *  el chico, para calzar con la columna de al lado. */
  readonly tamano?: "sm" | "base";

  /** Fondo blanco en el botón. Se apaga cuando el agregador vive dentro
   *  de una caja de color —la de audiencia "niños" es ámbar— y debe
   *  fundirse con ella en vez de recortar un rectángulo blanco. */
  readonly fondoBlanco?: boolean;

  /** Clases extra del contenedor. Necesario cuando el agregador es un
   *  ítem de una fila flex y necesita `flex-1`: con `w-full` queda a
   *  merced del encogido y el botón "Cancelar" de al lado se corre. */
  readonly className?: string;

  /** Si el buscador se vacía tras cada agregado. Encendido por omisión.
   *  Apagarlo deja la lista filtrada para seguir sumando parecidos. */
  readonly limpiarAlAgregar?: boolean;

  /** Si el buscador mira también el nombre de la sección. Encendido por
   *  omisión (los buscadores de ítems lo necesitan); los de servicios
   *  fijos lo apagan, porque ahí nunca se buscó por sección y el rótulo
   *  literal "Sin sección" haría que escribir "sin" trajera todos. */
  readonly buscarPorSeccion?: boolean;
}

export default function AgregadorDeItems({
  opciones,
  onAgregar,
  abierto,
  onAbiertoChange,
  placeholder,
  searchPlaceholder = "Buscar...",
  noResultsText = "No se encontraron resultados",
  disabled = false,
  tamano = "base",
  fondoBlanco = true,
  className = "",
  limpiarAlAgregar = true,
  buscarPorSeccion = true,
}: AgregadorDeItemsProps) {
  const lista = useListaBuscable({
    opciones,
    abierta: abierto,
    // El apunte gris es el precio: buscar por precio sería un accidente.
    buscarEnHint: false,
    buscarEnGrupo: buscarPorSeccion,
    // En listas largas, dar la vuelta desorienta.
    darLaVuelta: false,
    // Escribir tres letras y apretar Enter, sin tocar las flechas.
    marcarPrimero: true,
    alCerrar: () => onAbiertoChange(false),
  });

  const { reiniciar } = lista;

  const alternar = () => {
    if (disabled) return;
    if (abierto) {
      onAbiertoChange(false);
    } else {
      // El buscador nunca se reabre con lo escrito de la vez anterior.
      reiniciar();
      onAbiertoChange(true);
    }
  };

  const agregar = (valor: string) => {
    onAgregar(valor);
    if (limpiarAlAgregar) reiniciar();
    // El cursor NO se suelta: se sigue escribiendo el próximo servicio
    // sin volver a pinchar la barra.
    lista.refBuscador.current?.focus();
  };

  return (
    <div className={`relative ${className || "w-full"}`} ref={lista.refRaiz}>
      <button
        type="button"
        onClick={alternar}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className={`
          w-full px-3 py-2 border border-gray-300 rounded-lg
          focus:ring-2 focus:ring-blue-500 focus:border-transparent
          cursor-pointer flex items-center justify-between
          ${tamano === "sm" ? "text-sm" : ""}
          ${fondoBlanco ? "bg-white" : ""}
          ${disabled ? "bg-gray-100 cursor-not-allowed" : ""}
        `}
      >
        {/* SIEMPRE el placeholder, nunca lo elegido. */}
        <span className="truncate text-left text-gray-500">{placeholder}</span>
        <ChevronDown
          size={16}
          className={`text-gray-400 shrink-0 transition-transform ${
            abierto ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Siempre hacia ABAJO: hacia arriba taparía lo ya agregado.
          z-10 y no z-50 — un panel abierto detrás de una ventana debe
          quedar detrás, no montarse sobre el velo oscuro. */}
      {abierto && (
        // `data-lista-scroll` va ACÁ, en el elemento que de verdad
        // scrollea: verEnLista mide `offsetTop` contra él, y como el
        // panel es `absolute` también es el ancestro posicionado, así
        // que la cuenta calza. Ponerlo en un div interior —como estuvo
        // un rato el 14-08— rompía dos cosas a la vez: el
        // desplazamiento no encontraba dónde scrollear, y ese div
        // posicionado se pintaba ENCIMA de la cabecera del buscador,
        // dejando las opciones montadas sobre el texto (pillada de
        // Felipe en el laboratorio, con pantallazo).
        <div
          className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-[min(43rem,75vh)] overflow-y-auto"
          data-lista-scroll
        >
          {/* z-10 dentro del panel: la cabecera pegajosa tiene que
              pintarse SOBRE las opciones que pasan por debajo. */}
          <div className="sticky top-0 z-10 bg-white p-2 border-b border-gray-200">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                ref={lista.refBuscador}
                type="text"
                value={lista.texto}
                onChange={lista.alEscribir}
                onKeyDown={(e) => lista.teclaEnLista(e, agregar)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            {lista.filtradas.length > 0 ? (
              lista.filtradas.map((opcion, i) => {
                const anterior = lista.filtradas[i - 1];
                const abreGrupo =
                  !!opcion.group && opcion.group !== anterior?.group;
                return (
                  <div key={opcion.value}>
                    {abreGrupo && (
                      <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-50">
                        {opcion.group}
                      </div>
                    )}
                    <button
                      ref={i === lista.marcada ? lista.refMarcada : undefined}
                      type="button"
                      onClick={() => agregar(opcion.value)}
                      onMouseEnter={() => lista.setMarcada(i)}
                      // El hover es AZUL, no gris: con `hover:bg-gray-100`
                      // la fila bajo el mouse le ganaba en especificidad a
                      // `bg-blue-50` y la marca se veía gris. Y sin
                      // `text-sm`, para que las filas conserven el tamaño
                      // que tenían las copias escritas a mano.
                      className={`
                        w-full px-3 py-2 text-left text-gray-900
                        hover:bg-blue-50 focus:outline-none transition-colors
                        ${i === lista.marcada ? "bg-blue-50 text-blue-900" : ""}
                      `}
                    >
                      {/* El apunte va PEGADO al nombre, como en las
                          copias: "Pollo al jugo - $12.500". */}
                      {opcion.label}
                      {opcion.hint ? ` - ${opcion.hint}` : ""}
                    </button>
                  </div>
                );
              })
            ) : (
              // Alineado a la izquierda, como las seis copias.
              <div className="px-3 py-2 text-sm text-gray-500">
                {noResultsText}
              </div>
            )}
          </div>
          {/* Sin pie de "N resultados": ninguna copia lo tiene, y roba
              alto a una lista que se quiere lo más larga posible. */}
        </div>
      )}
    </div>
  );
}
