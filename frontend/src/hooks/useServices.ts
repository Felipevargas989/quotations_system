import { useState, useEffect } from "react";
import { findAllServices } from "../services/services.service";
import { VariableService, FixedService } from "../types/services.types";
import { CalculationType } from "../constants/services";

// Interface for compatibility with QuotationForm
export interface Product {
  codigo: string;
  nombre: string;
  precio: number;
  categoria?: string;
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
  const [products, setProducts] = useState<Product[]>([]);
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

      setVariableServices(data.variableServices);
      setFixedServices(data.fixedServices);

      // Transform variable services to products format for QuotationForm compatibility
      const transformedProducts = data.variableServices.map(
        transformVariableServiceToProduct,
      );
      setProducts(transformedProducts);

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

  // Transform VariableService to Product format for QuotationForm compatibility
  const transformVariableServiceToProduct = (
    service: VariableService,
  ): Product => ({
    codigo: service.code || service.id.toString(),
    nombre: service.name,
    precio: service.price,
    categoria: service.category,
  });

  // Transform FixedService to QuotationForm format
  const transformFixedServiceToFormatted = (
    service: FixedService,
  ): FixedServiceFormatted => ({
    codigo: service.code || service.id.toString(),
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
      // TODO: define all calculation types
      case CalculationType.FIJO: {
        return service.precio;
      }
      case CalculationType.POR_PERSONA: {
        return service.precio_por_persona * peopleCount;
      }
      case CalculationType.VARIABLE_CON_LIMITES: {
        const calculatedPrice = service.precio_por_persona * peopleCount;
        if (service.min_precio && calculatedPrice < service.min_precio)
          return service.min_precio;
        if (service.max_precio && calculatedPrice > service.max_precio)
          return service.max_precio;
        return calculatedPrice;
      }
      case CalculationType.VARIABLE_SIN_LIMITES: {
        return service.precio_por_persona * peopleCount;
      }
      default: {
        return service.precio;
      }
    }
  };

  return {
    // Raw data
    variableServices,
    fixedServices: formattedFixedServices,
    rawFixedServices: fixedServices,

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
