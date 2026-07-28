// FASE VELOCIDAD (28-07) — LA despensa compartida del catálogo de
// logística. Antes, Dashboard, Compras, el cotizador, Gestión, Cocina
// y el radar de Mobiliario pedían este MISMO sexteto cada uno por su
// cuenta (hasta 10 llamadas repetidas por pestaña). Ahora todos usan
// esta clave — el primero que llega la trae y el resto la reusa.
// La clave es la histórica de Compras: ["logistica","compras","base"].
import { useQuery } from "@tanstack/react-query";
import { getBaseCatalogo } from "../services/logistics.service";

export const useBaseLogistica = (companyId: number | null) =>
  useQuery({
    queryKey: ["logistica", "compras", "base", companyId],
    enabled: companyId !== null,
    // VELOCIDAD 2.0 (28-07): UN solo viaje — el backend junta las 6
    // listas en paralelo al lado de la base.
    queryFn: getBaseCatalogo,
    // El catálogo cambia poco: 5 minutos sin re-pedirlo al navegar.
    staleTime: 5 * 60 * 1000,
  });
