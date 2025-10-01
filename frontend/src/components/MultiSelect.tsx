import { useState, useEffect, useRef } from "react";
import { ChevronDown, X, Check } from "lucide-react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  readonly options: MultiSelectOption[];
  readonly value: string[];
  readonly onChange: (values: string[]) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

export default function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar opciones",
  disabled = false,
  className = "",
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
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
    const allValues = options.map((option) => option.value);
    onChange(allValues);
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

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Main selector button */}
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

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
          {/* Select All / Clear All buttons */}
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

          {/* Options list */}
          <div className="max-h-60 overflow-y-auto">
            {options.map((option) => {
              const isSelected = value.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`
                    w-full px-3 py-2 text-left text-gray-900 hover:bg-blue-50
                    focus:bg-blue-50 focus:outline-none transition-colors flex items-center space-x-2
                    ${isSelected ? "bg-blue-50" : ""}
                  `}
                  onClick={() => handleToggleOption(option.value)}
                >
                  <div
                    className={`w-4 h-4 border rounded flex items-center justify-center ${
                      isSelected
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-300"
                    }`}
                  >
                    {isSelected && <Check size={12} className="text-white" />}
                  </div>
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>

          {/* Selected count */}
          {value.length > 0 && (
            <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-200 bg-gray-50">
              {value.length} de {options.length} seleccionados
            </div>
          )}
        </div>
      )}
    </div>
  );
}
