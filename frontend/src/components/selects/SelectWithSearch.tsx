import { useState, useEffect, useRef } from "react";
import { ChevronDown, Search, X } from "lucide-react";
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

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

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
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleSelectOption(filteredOptions[highlightedIndex].value);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSearchText("");
        setHighlightedIndex(-1);
        break;
      case "Backspace":
        if (searchText === "") {
          setIsOpen(false);
        }
        break;
    }
  };

  // La opción marcada se mantiene A LA VISTA al navegar con flechas.
  // Sin esto, bajar más allá de lo visible dejaba la selección fuera de
  // pantalla — justo lo que Felipe pilló el 07-08 en el buscador de
  // ítems, y cuya cura (utils/verEnLista) vivía solo en esa copia.
  // verEnLista mueve SOLO la lista, nunca la página.
  const marcadaRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0) verEnLista(marcadaRef.current);
  }, [highlightedIndex, isOpen]);

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
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
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
          {value && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={16} />
            </button>
          )}
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

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
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Options list (alto adaptado al espacio real disponible) */}
          <div
            className="overflow-y-auto"
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
                      className={`
                        w-full px-3 py-2 text-left text-gray-900 hover:bg-blue-50
                        focus:bg-blue-50 focus:outline-none transition-colors
                        flex items-center gap-2
                        ${index === highlightedIndex ? "bg-blue-50" : ""}
                        ${option.value === value ? "bg-blue-100 font-medium" : ""}
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
