import { useMemo } from "react";
import { resolveFixedServicePrice } from "@dinero";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { findAllServices } from "../services/services.service";
import {
  VariableService,
  FixedService,
  ServiceCategorySetting,
  VariableServiceCategoryLink,
} from "../types/services.types";
import { CalculationType } from "../constants/services";

// Interface for compatibility with QuotationForm. With multi-category, there is
// one Product entry per (service, category) link, so a service shows up under
// each category it belongs to.
export interface Product {
  codigo: string;
  nombre: string;
  precio: number;
  categoria?: string;
  is_active?: boolean;
  category_id?: number;
  sort_order?: number | null;
}

// Interface for fixed services in QuotationForm format
export interface FixedServiceFormatted {
  // Secciones de fijos (migración 53): agrupan el desplegable del
  // cotizador y ordenan la cotización, como la carta de variables.
  section_id?: number | null;
  sort_order?: number | null;
  is_active?: boolean;
  codigo: string;
  nombre: string;
  precio: number;
  tipo_calculo: string;
  min_precio: number;
  max_precio: number;
  precio_por_persona: number;
  // Presente solo cuando la fuente lo trae; QuotationForm usa
  // "General" como respaldo (Fase 2 Bloque C).
  categoria?: string;
}

interface ServicesData {
  variableServices: VariableService[];
  fixedServices: FixedService[];
  categories: ServiceCategorySetting[];
  categoryLinks: VariableServiceCategoryLink[];
}

// Build one Product per (service, category) link, sorted by category order
// then per-category service order. This is what the quotation picker consumes.
const buildProductsFromLinks = (
  services: VariableService[],
  categories: ServiceCategorySetting[],
  links: VariableServiceCategoryLink[],
): Product[] => {
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // If there are no links at all (fresh DB / pre-migration), fall back to the
  // legacy single-category text so the picker still works.
  if (!links.length) {
    return services.map((service) => ({
      codigo: service.id.toString(),
      nombre: service.name,
      precio: service.price,
      categoria: service.category,
      is_active: service.is_active,
    }));
  }

  const rows = links
    .map((link) => {
      const service = serviceById.get(link.variable_service_id);
      const category = categoryById.get(link.category_id);
      if (!service || !category) return null;
      return {
        codigo: service.id.toString(),
        nombre: service.name,
        precio: service.price,
        categoria: category.name,
        is_active: service.is_active,
        category_id: category.id,
        sort_order: link.sort_order ?? null,
        _catOrder: category.sort_order ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  rows.sort((a, b) => {
    if (a._catOrder !== b._catOrder) return a._catOrder - b._catOrder;
    const so =
      (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
      (b.sort_order ?? Number.MAX_SAFE_INTEGER);
    if (so !== 0) return so;
    return a.nombre.localeCompare(b.nombre);
  });

  return rows.map(({ _catOrder, ...p }) => p);
};

// Transform FixedService to QuotationForm format
const transformFixedServiceToFormatted = (
  service: FixedService,
): FixedServiceFormatted => ({
  // Use the database id as the unique selection identifier (see note above).
  codigo: service.id.toString(),
  section_id: service.section_id ?? null,
  sort_order: service.sort_order ?? null,
  is_active: service.is_active,
  nombre: service.name,
  // El precio puede venir vacío del catálogo; 0 sigue la convención de
  // min/max de abajo, y resolveFixedServicePrice decide el valor real.
  precio: service.price ?? 0,
  tipo_calculo: service.calculation_type,
  min_precio: service.min_price || 0,
  max_precio: service.max_price || 0,
  precio_por_persona: service.price_per_person || 0,
});

// Catálogo completo (servicios variables + fijos + categorías) vía
// React Query (Etapa 2, 21-07-2026). Misma API del hook original:
// - loading solo la PRIMERA vez (sin datos aún); las recargas tras
//   arrastrar/renombrar/crear son silenciosas — el caché se reemplaza
//   en su lugar y la página no salta (comportamiento histórico).
// - reload() invalida y espera la versión fresca (awaitable).
export function useServices() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["services"],
    queryFn: async (): Promise<ServicesData> => {
      const data = await findAllServices();
      if (!data) throw new Error("No data returned from API");
      if (!data.variableServices || !Array.isArray(data.variableServices)) {
        throw new Error("Invalid variable services data");
      }
      if (!data.fixedServices || !Array.isArray(data.fixedServices)) {
        throw new Error("Invalid fixed services data");
      }
      return {
        variableServices: data.variableServices,
        fixedServices: data.fixedServices,
        categories: Array.isArray(data.categories) ? data.categories : [],
        categoryLinks: Array.isArray(data.categoryLinks)
          ? data.categoryLinks
          : [],
      };
    },
  });

  const variableServices = query.data?.variableServices ?? [];
  const fixedServices = query.data?.fixedServices ?? [];
  const categorySettings = query.data?.categories ?? [];
  const categoryLinks = query.data?.categoryLinks ?? [];

  // Derivados memorizados: solo se recalculan cuando llegan datos nuevos.
  const products = useMemo(
    () =>
      buildProductsFromLinks(variableServices, categorySettings, categoryLinks),
    [query.data],
  );

  const formattedFixedServices = useMemo(
    () => fixedServices.map(transformFixedServiceToFormatted),
    [query.data],
  );

  // Names of categories explicitly marked inactive (default = active).
  const inactiveCategories = useMemo(
    () =>
      categorySettings.filter((c) => c.is_active === false).map((c) => c.name),
    [query.data],
  );

  // Categories ordered by their sort_order (for admin + picker ordering).
  const orderedCategories = useMemo(
    () =>
      [...categorySettings].sort(
        (a, b) =>
          (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
          (b.sort_order ?? Number.MAX_SAFE_INTEGER),
      ),
    [query.data],
  );

  // FASE 1.2 (27-07-2026): la regla del precio de un fijo es UNA y vive
  // en @dinero (api-rest/src/quotations/utils/money.ts), junto al resto
  // de la cuenta. Acá solo se delega.
  const calculateFixedServicePrice = (
    service: FixedServiceFormatted,
    peopleCount: number,
  ): number => resolveFixedServicePrice(service, peopleCount);

  const reload = () =>
    queryClient.invalidateQueries({ queryKey: ["services"] });

  return {
    // Raw data
    variableServices,
    fixedServices: formattedFixedServices,
    rawFixedServices: fixedServices,
    categorySettings,
    orderedCategories,
    categoryLinks,
    inactiveCategories,

    // Transformed data for QuotationForm compatibility
    products,

    // State
    loading: query.isPending,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : "Error loading services"
      : null,

    // Actions
    reload,
    calculatePrice: calculateFixedServicePrice,
  };
}
