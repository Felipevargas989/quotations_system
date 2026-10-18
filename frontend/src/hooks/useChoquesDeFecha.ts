import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "../components/toast/Toast";
import {
  type ChoqueDeFecha,
  decidirChoque,
  type DecisionDelChoque,
  getChoquesDeFecha,
} from "../services/quotations.service";
import { humanizeApiError } from "../utils/apiErrors";

// CHOQUES DE FECHA (Felipe, 18-10-2026; mapa 02 §5.6). Las cotizaciones
// vivas cuyas fechas se topan con una aceptada llevan un aviso rojo en la
// tarjeta y en la ficha, hasta que alguien decide, una por una: «Sí, puede
// seguir» o «Hay que gestionar». Sin atajo por evento: depende de los
// espacios y los horarios de cada uno. El motor calcula el choque cada vez:
// si cambia una fecha, el aviso se va o vuelve solo.

export function useChoquesDeFecha() {
  const queryClient = useQueryClient();
  const choquesQuery = useQuery({
    // Bajo "quotations": cambiar un estado o una fecha ya refresca esa
    // familia, y con ella los choques.
    queryKey: ["quotations", "choques-de-fecha"],
    staleTime: 60_000,
    queryFn: getChoquesDeFecha,
  });
  /** "quotationId|aceptadaId" del que se está decidiendo. */
  const [decidiendo, setDecidiendo] = useState<string | null>(null);
  const choques = choquesQuery.data ?? [];

  const decidir = async (
    choque: ChoqueDeFecha,
    decision: DecisionDelChoque,
  ) => {
    const clave = `${choque.quotation_id}|${choque.aceptada.id}`;
    setDecidiendo(clave);
    try {
      await decidirChoque(choque.quotation_id, choque.aceptada.id, decision);
      toast.success(
        decision === "puede_seguir"
          ? `N° ${choque.quotation_number}: sigue con su fecha. Quedó anotado en el seguimiento.`
          : `N° ${choque.quotation_number}: quedó una llamada para hoy en el seguimiento (mover la fecha o descartar).`,
      );
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo guardar la revisión."));
    } finally {
      setDecidiendo(null);
    }
    // La línea nueva de la bitácora, el semáforo y la lista de choques.
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["quotations", "choques-de-fecha"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["seguimientos", choque.quotation_id],
      }),
      queryClient.invalidateQueries({ queryKey: ["seguimientos", "map"] }),
    ]);
  };

  return {
    choques,
    choquesDe: (quotationId: string) =>
      choques.filter((c) => c.quotation_id === quotationId),
    decidiendo,
    decidir,
  };
}
