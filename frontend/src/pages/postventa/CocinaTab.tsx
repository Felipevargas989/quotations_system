import { useEffect, useState } from "react";
import { Quotation } from "../../types/quotations.types";
import { useAuth } from "../../contexts/AuthContext";
import {
  getAllRecipeItems,
  getCatalogServiceNameIds,
  getFurnitureItems,
  getSupplies,
} from "../../services/logistics.service";
import {
  FurnitureItem,
  RecipeItem,
  Supply,
} from "../../types/logistics.types";
import FichaCocinaSection from "./FichaCocinaSection";

// Pestaña Cocina del evento: la ficha de cocina con su propia casa.
// Horarios por servicio, notas del evento, vista previa de los platos y el
// botón Imprimir. (Antes vivía apretada dentro de Gestión.)

export default function CocinaTab({
  quote,
}: {
  readonly quote: Quotation;
}) {
  const { company } = useAuth();
  const companyId = company?.id ? Number(company.id) : null;
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);
  const [nameIds, setNameIds] = useState<{
    variable: Record<string, number>;
    fixed: Record<string, number>;
  }>({ variable: {}, fixed: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId === null) return;
    setLoading(true);
    Promise.all([
      getAllRecipeItems(companyId),
      getSupplies(companyId),
      getFurnitureItems(companyId),
      getCatalogServiceNameIds(companyId),
    ])
      .then(([r, s, f, n]) => {
        setRecipes(r);
        setSupplies(s);
        setFurniture(f);
        setNameIds(n);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  if (companyId === null) return null;
  if (loading) {
    return (
      <div className="py-10 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <FichaCocinaSection
      companyId={companyId}
      quote={quote}
      recipes={recipes}
      supplies={supplies}
      furniture={furniture}
      nameIds={nameIds}
    />
  );
}
