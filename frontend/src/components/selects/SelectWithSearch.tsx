import { useState, useEffect, useRef } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { SelectWithSearchProps } from "./types";
import { matchesSearch } from "../../utils/searchMatch";

export default function SelectWithSearch({
  options,
  value,
  onChange,
  placeholder = "Seleccionar opción",
  searchPlaceholder = "Buscar...",
  noResultsText = "No se encontraron resultados",
  disabled = false,
  required = false,
  className = "",
}: SelectWithSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  // Drop-up inteligente: si abajo no hay espacio para la lista, se
  // abre hacia ARRIBA (caso típico: campo al fondo de una ventana con
  // scroll interno, ej. Proveedor en Nuevo insumo). 22-07-2026.
  const [openUp, setOpenUp] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Alto estimado de la lista desplegada (buscador + max-h-60).
  const LIST_HEIGHT = 320;

  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUp(spaceBelow < LIST_HEIGHT && rect.top > spaceBelow);
  }, [isOpen]);

  // Búsqueda inteligente del sistema: sin tildes, por palabras en
  // cualquier orden (utils/searchMatch).
  const filteredOptions = options.filter((option) =>
    matchesSearch(searchText, option.label),
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

  const handleSelectOption = (optionValue: string) => {
    onChange(optionValue);
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
    <div className={`relative w-full ${className}`} ref={dropdownRef}>
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

          {/* Options list */}
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  className={`
                    w-full px-3 py-2 text-left text-gray-900 hover:bg-blue-50
                    focus:bg-blue-50 focus:outline-none transition-colors
                    ${index === highlightedIndex ? "bg-blue-50" : ""}
                    ${option.value === value ? "bg-blue-100 font-medium" : ""}
                  `}
                  onClick={() => handleSelectOption(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {option.label}
                </button>
              ))
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
