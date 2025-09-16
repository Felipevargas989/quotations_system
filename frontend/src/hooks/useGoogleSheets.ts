import { useState, useEffect } from "react";
import { googleSheetsService } from "../services/googleSheetsService";

interface Product {
  codigo: string;
  nombre: string;
  precio: number;
  categoria?: string;
}

export function useGoogleSheets() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!googleSheetsService.isConfigured()) {
        console.warn("Google Sheets no está configurado");
        setProducts([]);
        return;
      }

      const data = await googleSheetsService.getProducts();
      setProducts(
        data.map((product) => ({
          ...product,
          categoria: product.categoria || "",
        })),
      );
    } catch (err) {
      console.error("Error loading products from Google Sheets:", err);
      setError(err instanceof Error ? err.message : "Error desconocido");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  return { products, loading, error, reload: loadProducts };
}

export function useGoogleSheetsFixed() {
  const [fixedServices, setFixedServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFixedServices();
  }, []);

  const loadFixedServices = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!googleSheetsService.isConfigured()) {
        console.warn("Google Sheets no está configurado");
        setFixedServices([]);
        return;
      }

      const data = await googleSheetsService.getFixedServices();
      setFixedServices(data);
    } catch (err) {
      console.error("Error loading fixed services from Google Sheets:", err);
      setError(err instanceof Error ? err.message : "Error desconocido");
      setFixedServices([]);
    } finally {
      setLoading(false);
    }
  };

  const calculatePrice = (service: any, peopleCount: number): number => {
    return googleSheetsService.calculateFixedServicePrice(service, peopleCount);
  };

  return {
    fixedServices,
    loading,
    error,
    reload: loadFixedServices,
    calculatePrice,
  };
}
