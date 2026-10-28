import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getApariencias } from "../services/users.service";
import type { Apariencia } from "../utils/personajes";

// EL PERSONAJE Y EL COLOR DE CADA UNO (Felipe, 27-10-2026; migración 167).
// Una sola lista por empresa, indexada por el id de Auth de cada persona,
// que es el que guarda cada nota como `author_user_id`. Cambia poco: se
// pide una vez y se refresca al guardar en Mi cuenta. Si falla, el
// Seguimiento se ve como antes (letra con el color automático).
export const CLAVE_APARIENCIAS = ["apariencias"] as const;

export function useApariencias() {
  const query = useQuery({
    queryKey: CLAVE_APARIENCIAS,
    queryFn: getApariencias,
    staleTime: 10 * 60_000,
  });
  const porUsuario = useMemo(
    () =>
      new Map<string, Apariencia>(
        (query.data ?? []).map((a) => [a.user_id, a]),
      ),
    [query.data],
  );
  return { porUsuario, cargando: query.isPending };
}
