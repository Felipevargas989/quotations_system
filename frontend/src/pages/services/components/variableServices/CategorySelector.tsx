import { useState, useEffect, useRef } from "react";
import { ChevronDown, Plus } from "lucide-react";

interface CategorySelectorProps {
  readonly value: string;
  readonly onChange: (category: string) => void;
  readonly existingCategories: string[];
  readonly placeholder?: string;
  readonly required?: boolean;
}

export default function CategorySelector({
  value,
  onChange,
  existingCategories,
  placeholder = "Seleccionar o crear categoría",
  required = false,
}: CategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAddNew, setShowAddNew] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowAddNew(false);
        setNewCategory("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelectCategory = (category: string) => {
    onChange(category);
    setIsOpen(false);
    setShowAddNew(false);
    setNewCategory("");
  };

  const handleAddNewCategory = () => {
    if (newCategory.trim()) {
      onChange(newCategory.trim());
      setIsOpen(false);
      setShowAddNew(false);
      setNewCategory("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (showAddNew) {
        handleAddNewCategory();
      } else {
        setShowAddNew(true);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setShowAddNew(false);
      setNewCategory("");
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer bg-white flex items-center justify-between"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
      >
        <span className={value ? "text-gray-900" : "text-gray-500"}>
          {value || placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {/* Existing categories */}
          {existingCategories.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b">
                Categorías existentes
              </div>
              {existingCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className="w-full px-3 py-2 text-left text-gray-900 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                  onClick={() => handleSelectCategory(category)}
                >
                  {category}
                </button>
              ))}
            </>
          )}

          {/* Add new category option */}
          <div className="border-t">
            {!showAddNew ? (
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-blue-600 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none flex items-center space-x-2"
                onClick={() => setShowAddNew(true)}
              >
                <Plus size={16} />
                <span>Agregar nueva categoría</span>
              </button>
            ) : (
              <div className="p-3 bg-gray-50">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Nombre de la nueva categoría"
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddNewCategory();
                      } else if (e.key === "Escape") {
                        setShowAddNew(false);
                        setNewCategory("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddNewCategory}
                    disabled={!newCategory.trim()}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Agregar
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddNew(false);
                    setNewCategory("");
                  }}
                  className="mt-1 text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
