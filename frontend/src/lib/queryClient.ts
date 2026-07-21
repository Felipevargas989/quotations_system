import { QueryClient } from "@tanstack/react-query";

// Cliente global de React Query (Etapa 0 de la migración, definida con
// Felipe el 21-07-2026). Política por defecto del sistema:
//
// - staleTime 30s: lo recién visto se muestra al instante al volver a
//   una pantalla; pasado ese tiempo se revalida en segundo plano
//   ("mostrar lo conocido y refrescar por detrás").
// - refetchOnWindowFocus: al volver a la pestaña, todo se revalida.
// - retry 2: los parpadeos de red se reintentan solos antes de fallar.
//
// Las pantallas de PLATA (Post-Venta) definirán staleTime 0 en sus
// propias consultas cuando migren (Etapa 4): ahí la frescura manda.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: true,
      retry: 2,
    },
  },
});
