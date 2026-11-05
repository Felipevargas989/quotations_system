import { useState, useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, X, Check, Search } from "lucide-react";
import { matchesSearch } from "../utils/searchMatch";

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Un número a la derecha: cuántas hay de esa opción. */
  cantidad?: number;
  /** Un punto de color antes del nombre (el color del tipo de cliente). */
  dotClass?: string;
}

interface MultiSelectProps {
  readonly options: MultiSelectOption[];
  readonly value: string[];
  readonly onChange: (values: string[]) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  /** Buscador arriba del panel (28-08): para listas largas. */
  readonly buscador?: boolean;
  readonly searchPlaceholder?: string;
  /** Como chip de filtro (05-11-2026, el tipo de cliente del tablero): del
   *  tamaño del chip de orden, dice qué filtra y se pone azul con algo
   *  elegido. La lista va compacta y entera, sin «Seleccionar Todo»: se
   *  limpia con la × del chip o con «Ver todos». */
  readonly compacto?: boolean;
  /** El ícono del chip compacto. */
  readonly icono?: ReactNode;
}

export default function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar opciones",
  disabled = false,
  className = "",
  buscador = false,
  searchPlaceholder = "Buscar…",
  compacto = false,
  icono,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [busca, setBusca] = useState("");
  // Lo que se ve en la lista: con buscador, solo lo que calza.
  const visibles =
    buscador && busca.trim()
      ? options.filter((o) => matchesSearch(busca, o.label))
      : options;
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleToggleOption = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const handleSelectAll = () => {
    // Con búsqueda activa, "todo" es lo que se está viendo.
    const nuevos = visibles.map((option) => option.value);
    onChange([...new Set([...value, ...nuevos])]);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const getDisplayText = () => {
    if (value.length === 0) return placeholder;
    if (value.length === options.length) return "Todos seleccionados";
    if (value.length === 1) {
      const selectedOption = options.find(
        (option) => option.value === value[0],
      );
      return selectedOption ? selectedOption.label : value[0];
    }
    return `${value.length} seleccionados`;
  };

  // El chip compacto dice qué filtra: «Empresas», o «Empresas +2».
  const textoCompacto = () => {
    if (value.length === 0) return placeholder;
    const primera =
      options.find((option) => option.value === value[0])?.label ?? value[0];
    return value.length === 1 ? primera : `${primera} +${value.length - 1}`;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Main selector button */}
      {compacto ? (
        <button
          type="button"
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold whitespace-nowrap ${
            value.length > 0
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          {icono}
          {textoCompacto()}
          {value.length > 0 && !disabled ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Quitar el filtro"
              title="Quitar el filtro"
              onClick={(e) => {
                e.stopPropagation();
                handleClearAll();
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                e.stopPropagation();
                handleClearAll();
              }}
              className="ml-0.5 text-blue-500 hover:text-blue-800"
            >
              <X size={14} />
            </span>
          ) : (
            <ChevronDown size={12} />
          )}
        </button>
      ) : (
        <button
          type="button"
          className={`
          w-full px-3 py-2 border border-gray-300 rounded-lg
          focus:ring-2 focus:ring-blue-500 focus:border-transparent
          cursor-pointer bg-white flex items-center justify-between
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <div className="flex-1 text-left">
            <span
              className={value.length > 0 ? "text-gray-900" : "text-gray-500"}
            >
              {getDisplayText()}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            {value.length > 0 && !disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearAll();
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Limpiar selección"
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
      )}

      {/* Dropdown */}
      {isOpen && (
        <div
          className={`absolute z-50 mt-1 bg-white border rounded-lg shadow-lg ${
            compacto
              ? "left-0 top-full w-72 border-gray-200 py-1"
              : "w-full border-gray-300"
          }`}
        >
          {buscador && (
            <div className="relative border-b border-gray-200">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-2 text-sm border-0 focus:ring-0 focus:outline-none rounded-t-lg"
              />
            </div>
          )}
          {/* Select All / Clear All buttons (el compacto no los trae) */}
          {!compacto && (
            <div className="p-2 border-b border-gray-200 flex space-x-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="flex-1 px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
              >
                Seleccionar Todo
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="flex-1 px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100 transition-colors"
              >
                Limpiar Todo
              </button>
            </div>
          )}

          {/* Options list */}
          <div
            className={`${compacto ? "max-h-96" : "max-h-60"} overflow-y-auto`}
          >
            {visibles.length === 0 && (
              <p className="px-3 py-3 text-sm text-gray-400">
                No se encontraron opciones
              </p>
            )}
            {visibles.map((option) => {
              const isSelected = value.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`
                    w-full px-3 ${compacto ? "py-1.5 text-sm" : "py-2"} text-left text-gray-900 hover:bg-blue-50
                    focus:bg-blue-50 focus:outline-none transition-colors flex items-center space-x-2
                    ${isSelected ? "bg-blue-50" : ""}
                  `}
                  onClick={() => handleToggleOption(option.value)}
                >
                  <div
                    className={`${compacto ? "w-3.5 h-3.5" : "w-4 h-4"} shrink-0 border rounded flex items-center justify-center ${
                      isSelected
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-300"
                    }`}
                  >
                    {isSelected && (
                      <Check size={compacto ? 10 : 12} className="text-white" />
                    )}
                  </div>
                  {option.dotClass && (
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${option.dotClass}`}
                    />
                  )}
                  <span
                    className={compacto ? "flex-1 min-w-0 truncate" : undefined}
                    title={compacto ? option.label : undefined}
                  >
                    {option.label}
                  </span>
                  {option.cantidad !== undefined && (
                    <span
                      className={`pl-2 tabular-nums font-semibold ${
                        option.cantidad > 0 ? "text-gray-500" : "text-gray-300"
                      }`}
                    >
                      {option.cantidad.toLocaleString("es-CL")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected count */}
          {value.length > 0 && compacto && (
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                type="button"
                onClick={() => {
                  handleClearAll();
                  setIsOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-sm font-medium text-blue-600 hover:underline"
              >
                Ver todos
              </button>
            </div>
          )}
          {value.length > 0 && !compacto && (
            <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-200 bg-gray-50">
              {value.length} de {options.length} seleccionados
            </div>
          )}
        </div>
      )}
    </div>
  );
}
