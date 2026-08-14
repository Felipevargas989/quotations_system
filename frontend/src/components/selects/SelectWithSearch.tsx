import { useState, useEffect, useRef } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { SelectWithSearchProps } from "./types";
import { matchesSearch } from "../../utils/searchMatch";
import { verEnLista } from "../../utils/verEnLista";

export default function SelectWithSearch({
  options,
  value,
  onChange,
  placeholder = "Seleccionar opción",
  searchPlaceholder = "Buscar...",
  noResultsText = "No se encontraron resultados",
  disabled = false,
  required = false,
  keepOpenOnSelect = false,
}: SelectWithSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  // Drop-up inteligente: si abajo no hay espacio para la lista, se
  // abre hacia ARRIBA (caso típico: campo al fondo de una ventana con
  // scroll interno, ej. Proveedor en Nuevo insumo). 22-07-2026.
  const [openUp, setOpenUp] = useState(false);
  // Alto máximo de la LISTA interna (px): se recalcula al abrir para
  // que el panel completo (buscador incluido) quepa en el espacio real
  // del contenedor con scroll más cercano — dentro de un modal, el
  // espacio no es la ventana (pillada de Felipe 03-08: el panel se
  // abría hacia arriba y el modal se lo recortaba con buscador y todo).
  const [listMaxH, setListMaxH] = useState(240);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Alto estimado de la lista desplegada (buscador + max-h-60).
  const LIST_HEIGHT = 320;
  // Alto del buscador + bordes del panel (se resta del espacio).
  const PANEL_EXTRA = 62;

  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    // Límites del contenedor con scroll más cercano (o la ventana).
    let topLimit = 0;
    let bottomLimit = window.innerHeight;
    let node: HTMLElement | null = dropdownRef.current.parentElement;
    while (node) {
      const oy = getComputedStyle(node).overflowY;
      if (oy === "auto" || oy === "scroll" || oy === "hidden") {
        const r = node.getBoundingClientRect();
        topLimit = Math.max(topLimit, r.top);
        bottomLimit = Math.min(bottomLimit, r.bottom);
        break;
      }
      node = node.parentElement;
    }
    const spaceBelow = bottomLimit - rect.bottom - 8;
    const spaceAbove = rect.top - topLimit - 8;
    const up = spaceBelow < LIST_HEIGHT && spaceAbove > spaceBelow;
    setOpenUp(up);
    const disponible = (up ? spaceAbove : spaceBelow) - PANEL_EXTRA;
    setListMaxH(Math.max(120, Math.min(240, disponible)));
  }, [isOpen]);

  // Búsqueda inteligente del sistema: sin tildes, por palabras en
  // cualquier orden (utils/searchMatch).
  const filteredOptions = options.filter((option) =>
    matchesSearch(searchText, option.label, option.hint, option.group),
  );

  // Get selected option label
  const selectedOption = options.find((option) => option.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchText("");
        setHighlightedIndex(-1);
      }
    };
    // (no usa cerrar() a propósito: este efecto se registra una sola
    // vez y no debe depender de una función que se recrea en cada
    // pintada)

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // EL TECLADO, EN LOS DOS SITIOS DONDE VIVE EL FOCO
  //
  // Antes había UN solo manejador colgado del botón. Pero al abrir, el
  // foco salta al buscador (más abajo), y el buscador es HERMANO del
  // botón, no hijo: las teclas nunca llegaban. Resultado: con la lista
  // abierta, flechas, Enter y Escape no hacían absolutamente nada en
  // las 15 pantallas que usan esta pieza. Las copias escritas a mano
  // del cotizador y de Post-Venta sí lo tenían bien puesto — o sea, la
  // pieza de la casa estaba PEOR que las copias. (13-08-2026)

  // Con la lista CERRADA, el foco está en el botón. Enter y Espacio ya
  // los maneja el navegador solo (disparan el clic del <button>): si
  // además los atendiéramos acá, el panel se abriría y cerraría en la
  // misma tecla. Por eso acá solo vive la flecha abajo.
  const teclaEnBoton = (e: React.KeyboardEvent) => {
    if (!isOpen && e.key === "ArrowDown") {
      e.preventDefault();
      abrir();
    }
  };

  // Con la lista ABIERTA, el foco está en el buscador. Acá sí vive todo.
  const teclaEnLista = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1,
        );
        break;
      case "Enter":
        // preventDefault también evita que Enter envíe el formulario
        // que rodea al desplegable.
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleSelectOption(filteredOptions[highlightedIndex].value);
        }
        break;
      case "Escape":
        e.preventDefault();
        cerrar();
        break;
    }
    // OJO: acá NO va Backspace. La versión anterior cerraba el panel al
    // apretar Backspace con el buscador vacío; como el manejador estaba
    // muerto, eso nunca llegó a pasar. Encenderlo ahora habría añadido
    // un comportamiento que ninguna pantalla pidió: borrar lo escrito y
    // pasarse una tecla cerraría la lista.
  };

  // La opción marcada se mantiene A LA VISTA al navegar con flechas.
  // Sin esto, bajar más allá de lo visible dejaba la selección fuera de
  // pantalla — justo lo que Felipe pilló el 07-08 en el buscador de
  // ítems, y cuya cura (utils/verEnLista) vivía solo en esa copia.
  // verEnLista mueve SOLO la lista, nunca la página.
  // `searchText` está en las dependencias a propósito: al filtrar, la
  // lista cambia de contenido pero la marca puede quedarse en el mismo
  // número, y entonces el efecto no volvía a correr — se filtraba con
  // la lista scrolleada a la mitad y la fila marcada quedaba fuera de
  // pantalla. En las copias a mano esto salía gratis porque usaban un
  // ref-callback que corre en cada pintada. (13-08-2026)
  const marcadaRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0) verEnLista(marcadaRef.current);
  }, [highlightedIndex, isOpen, searchText]);

  // Abrir y cerrar pasan SIEMPRE por acá, para que el panel no se
  // reabra nunca con lo escrito de la vez anterior: antes se limpiaba
  // al cerrar por clic afuera pero no al cerrar con el botón, así que
  // al reabrir la lista aparecía filtrada por un texto viejo y parecía
  // que faltaran opciones. (13-08-2026)
  const abrir = () => {
    setSearchText("");
    setHighlightedIndex(-1);
    setIsOpen(true);
  };

  const cerrar = () => {
    setSearchText("");
    setHighlightedIndex(-1);
    setIsOpen(false);
  };

  const handleSelectOption = (optionValue: string) => {
    onChange(optionValue);
    // Los selectores que AGREGAN (ítems, insumos, servicios sueltos)
    // se quedan abiertos: casi nunca se agrega uno solo.
    if (keepOpenOnSelect) {
      setSearchText("");
      setHighlightedIndex(-1);
      searchInputRef.current?.focus();
      return;
    }
    setIsOpen(false);
    setSearchText("");
    setHighlightedIndex(-1);
  };

  const handleClear = () => {
    onChange("");
    setSearchText("");
    setHighlightedIndex(-1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
    setHighlightedIndex(-1);
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Main selector button */}
      <button
        type="button"
        className={`
          w-full px-3 py-2 border border-gray-300 rounded-lg
          focus:ring-2 focus:ring-blue-500 focus:border-transparent
          cursor-pointer bg-white flex items-center justify-between
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          ${required && !value ? "border-red-300" : ""}
        `}
        onClick={() => !disabled && (isOpen ? cerrar() : abrir())}
        onKeyDown={teclaEnBoton}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span
          className={`truncate text-left ${
            selectedOption ? "text-gray-900" : "text-gray-500"
          }`}
          title={selectedOption?.label}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <div className="flex items-center space-x-1">
          {/* Hueco para que la X no se monte sobre el texto. */}
          {value && !disabled && <span className="w-4" aria-hidden="true" />}
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* La X para limpiar va FUERA del botón principal, flotando sobre
          él. Antes era un <button> DENTRO de otro <button>: HTML
          inválido que React reclama en consola, que los navegadores
          reparan cada uno a su manera y que dejaba al botón principal
          con dos nombres accesibles. (13-08-2026) */}
      {value && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Limpiar selección"
        >
          <X size={16} />
        </button>
      )}

      {/* Dropdown (hacia abajo, o hacia arriba si abajo no cabe) */}
      {isOpen && (
        <div
          className={`absolute z-50 w-full bg-white border border-gray-300 rounded-lg shadow-lg ${
            openUp ? "bottom-full mb-1" : "mt-1"
          }`}
        >
          {/* Search input */}
          <div className="p-2 border-b border-gray-200">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchText}
                onChange={handleSearchChange}
                onKeyDown={teclaEnLista}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Options list (alto adaptado al espacio real disponible).
              El `relative` NO es decorativo: verEnLista mide la fila
              marcada con offsetTop, que se cuenta desde el ancestro
              posicionado. Sin él, el ancestro era el panel completo y
              la medida venía inflada con el alto del buscador (~62 px),
              así que la lista se desplazaba de más y la fila marcada
              quedaba corrida. (13-08-2026) */}
          <div
            className="relative overflow-y-auto"
            style={{ maxHeight: listMaxH }}
            data-lista-scroll
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => {
                // Encabezado de sección al cambiar de grupo (13-08).
                const anterior = filteredOptions[index - 1];
                const abreGrupo =
                  !!option.group && option.group !== anterior?.group;
                return (
                  <div key={option.value}>
                    {abreGrupo && (
                      <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-50">
                        {option.group}
                      </div>
                    )}
                    <button
                      ref={index === highlightedIndex ? marcadaRef : undefined}
                      type="button"
                      // EL FONDO AZUL SIGNIFICA UNA SOLA COSA: dónde
                      // estás parado. Antes había DOS fondos sueltos —
                      // uno para la marcada y otro para la ya elegida—
                      // y se pintaban juntos: con la lista abierta se
                      // veían dos filas azules y no se entendía cuál
                      // iba a elegir el Enter (pillada de Felipe,
                      // 13-08). Ahora lo elegido se muestra con un
                      // visto, que no compite con la marca.
                      className={`
                        w-full px-3 py-2 text-left text-gray-900
                        hover:bg-blue-50 focus:outline-none transition-colors
                        flex items-center gap-2
                        ${index === highlightedIndex ? "bg-blue-50" : ""}
                        ${option.value === value ? "font-medium" : ""}
                      `}
                      onClick={() => handleSelectOption(option.value)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      {option.dotClass && (
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${option.dotClass}`}
                        />
                      )}
                      <span className="flex-1">{option.label}</span>
                      {option.hint && (
                        <span className="text-xs text-gray-400 shrink-0">
                          {option.hint}
                        </span>
                      )}
                      {option.value === value && (
                        <Check
                          size={15}
                          className="text-blue-600 shrink-0"
                          aria-label="Elegida"
                        />
                      )}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-2 text-gray-500 text-sm text-center">
                {noResultsText}
              </div>
            )}
          </div>

          {/* Results count */}
          {filteredOptions.length > 0 && (
            <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-200 bg-gray-50">
              {filteredOptions.length} resultado
              {filteredOptions.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
