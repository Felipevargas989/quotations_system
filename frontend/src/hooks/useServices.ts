import { useState, useEffect } from "react";
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
  codigo: string;
  nombre: string;
  precio: number;
  tipo_calculo: string;
  min_precio: number;
  max_precio: number;
  precio_por_persona: number;
}

export function useServices() {
  const [variableServices, setVariableServices] = useState<VariableService[]>(
    [],
  );
  const [fixedServices, setFixedServices] = useState<FixedService[]>([]);
  const [categorySettings, setCategorySettings] = useState<
    ServiceCategorySetting[]
  >([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryLinks, setCategoryLinks] = useState<
    VariableServiceCategoryLink[]
  >([]);
  const [formattedFixedServices, setFormattedFixedServices] = useState<
    FixedServiceFormatted[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await findAllServices();

      // Check if data exists and has the expected structure
      if (!data) {
        setError("No data returned from API");
        return;
      }

      if (!data.variableServices || !Array.isArray(data.variableServices)) {
        setError("Invalid variable services data");
        return;
      }

      if (!data.fixedServices || !Array.isArray(data.fixedServices)) {
        setError("Invalid fixed services data");
        return;
      }

      const categories = Array.isArray(data.categories) ? data.categories : [];
      const links = Array.isArray(data.categoryLinks) ? data.categoryLinks : [];

      setVariableServices(data.variableServices);
      setFixedServices(data.fixedServices);
      setCategorySettings(categories);
      setCategoryLinks(links);

      // Build the picker products: one entry per (service, category) link, so a
      // service appears under every category it belongs to, in its per-category
      // order. Falls back to the legacy single category if there are no links.
      setProducts(
        buildProductsFromLinks(data.variableServices, categories, links),
      );

      // Transform fixed services to QuotationForm format
      const transformedFixedServices = data.fixedServices.map(
        transformFixedServiceToFormatted,
      );
      setFormattedFixedServices(transformedFixedServices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading services");
      setVariableServices([]);
      setFixedServices([]);
      setProducts([]);
      setFormattedFixedServices([]);
    } finally {
      setLoading(false);
    }
  };

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
    nombre: service.name,
    precio: service.price,
    tipo_calculo: service.calculation_type,
    min_precio: service.min_price || 0,
    max_precio: service.max_price || 0,
    precio_por_persona: service.price_per_person || 0,
  });

  // Calculate price for fixed services based on calculation type and people count
  const calculateFixedServicePrice = (
    service: FixedServiceFormatted,
    peopleCount: number,
  ): number => {
    switch (service.tipo_calculo) {
      case CalculationType.VARIABLE_CON_LIMITES: {
        const calculatedPrice = service.precio_por_persona * peopleCount;
        if (service.min_precio && calculatedPrice < service.min_precio)
          return service.min_precio;
        if (service.max_precio && calculatedPrice > service.max_precio)
          return service.max_precio;
        return calculatedPrice;
      }
      case CalculationType.FIJO_VARIABLE: {
        return service.precio + service.precio_por_persona * peopleCount;
      }
      case CalculationType.FIJO:
      default: {
        return service.precio;
      }
    }
  };

  // Names of categories explicitly marked inactive (default = active).
  const inactiveCategories = categorySettings
    .filter((c) => c.is_active === false)
    .map((c) => c.name);

  // Categories ordered by their sort_order (for admin + picker ordering).
  const orderedCategories = [...categorySettings].sort(
    (a, b) =>
      (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
      (b.sort_order ?? Number.MAX_SAFE_INTEGER),
  );

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
    loading,
    error,

    // Actions
    reload: loadServices,
    calculatePrice: calculateFixedServicePrice,
  };
}
