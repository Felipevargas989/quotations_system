import { useBaseLogistica } from "../../hooks/useBaseLogistica";
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
  // FASE VELOCIDAD (28-07): el catálogo sale de la despensa compartida
  // (useBaseLogistica) — antes esta pestaña re-pedía las mismas 4
  // listas en cada cambio de pestaña, sin caché alguna.
  const base = useBaseLogistica(companyId);
  const recipes: RecipeItem[] = base.data?.recipes ?? [];
  const supplies: Supply[] = base.data?.supplies ?? [];
  const furniture: FurnitureItem[] = base.data?.furniture ?? [];
  const nameIds: {
    variable: Record<string, number>;
    fixed: Record<string, number>;
  } = base.data?.nameIds ?? { variable: {}, fixed: {} };
  const loading = base.isPending;

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
