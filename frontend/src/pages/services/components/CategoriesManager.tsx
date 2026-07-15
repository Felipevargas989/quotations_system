import { Eye, EyeOff, Layers } from "lucide-react";

interface CategoriesManagerProps {
  // All distinct category names (derived from variable services).
  readonly categories: string[];
  // Names of categories currently deactivated.
  readonly inactiveCategories: string[];
  readonly onToggleCategory: (name: string, nextActive: boolean) => void;
}

export default function CategoriesManager({
  categories,
  inactiveCategories,
  onToggleCategory,
}: CategoriesManagerProps) {
  const inactiveSet = new Set(inactiveCategories);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 flex items-center space-x-2">
            <Layers className="h-5 w-5 text-purple-600" />
            <span>Categorías</span>
          </h3>
          <span className="text-sm text-gray-500">
            {categories.length} categorías
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Las categorías desactivadas se ocultan al crear nuevas cotizaciones,
          pero siguen visibles en las cotizaciones ya creadas.
        </p>
      </div>

      <div className="p-6">
        {categories.length === 0 ? (
          <p className="text-sm text-gray-500">No hay categorías registradas</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {categories.map((category) => {
              const active = !inactiveSet.has(category);
              return (
                <button
                  key={category}
                  onClick={() => onToggleCategory(category, !active)}
                  className={`inline-flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    active
                      ? "bg-green-50 border-green-200 text-green-800 hover:bg-green-100"
                      : "bg-gray-100 border-gray-300 text-gray-500 hover:bg-gray-200"
                  }`}
                  title={active ? "Desactivar categoría" : "Activar categoría"}
                >
                  {active ? <Eye size={14} /> : <EyeOff size={14} />}
                  <span>{category}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
