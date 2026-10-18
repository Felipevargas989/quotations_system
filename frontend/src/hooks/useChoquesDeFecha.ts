import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "../components/toast/Toast";
import {
  type ChoqueDeFecha,
  getChoquesDeFecha,
  seguirConLaFecha,
} from "../services/quotations.service";
import { humanizeApiError } from "../utils/apiErrors";

// TOPES DE CALENDARIO (Felipe, 18-10-2026; mapa 02 §5.6). Las cotizaciones
// vivas cuyas fechas se topan con una aceptada llevan el «Tope de
// calendario» con borde rojo en la tarjeta y en el hilo de seguimiento,
// hasta que se cambia la fecha, se cierra la cotización o alguien aprieta
// «Sí, puede seguir» (el botón «Hay que gestionar» se quitó: el tope mismo
// es la marca). Sin atajo por evento. El motor calcula el tope cada vez.

export function useChoquesDeFecha() {
  const queryClient = useQueryClient();
  const choquesQuery = useQuery({
    // Bajo "quotations": cambiar un estado o una fecha ya refresca esa
    // familia, y con ella los topes.
    queryKey: ["quotations", "choques-de-fecha"],
    staleTime: 60_000,
    queryFn: getChoquesDeFecha,
  });
  /** La cotización cuyo «Sí, puede seguir» se está guardando. */
  const [guardando, setGuardando] = useState<string | null>(null);
  const choques = choquesQuery.data ?? [];

  /** «Sí, puede seguir» para todos los topes de UNA cotización. */
  const seguir = async (lista: ChoqueDeFecha[]) => {
    if (lista.length === 0) return;
    const { quotation_id: id, quotation_number: numero } = lista[0];
    setGuardando(id);
    let hechas = 0;
    try {
      for (const c of lista) {
        await seguirConLaFecha(c.quotation_id, c.aceptada.id);
        hechas++;
      }
      toast.success(
        `N° ${numero}: sigue con su fecha${lista.length > 1 ? ` (${lista.length} topes revisados)` : ""}. Quedó anotado en el seguimiento.`,
      );
    } catch (e) {
      toast.error(
        humanizeApiError(
          e,
          hechas > 0
            ? `Se guardaron ${hechas} de ${lista.length}; vuelve a intentarlo.`
            : "No se pudo guardar la revisión.",
        ),
      );
    } finally {
      setGuardando(null);
    }
    // La línea nueva de la bitácora, el semáforo y la lista de topes.
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["quotations", "choques-de-fecha"],
      }),
      queryClient.invalidateQueries({ queryKey: ["seguimientos", id] }),
      queryClient.invalidateQueries({ queryKey: ["seguimientos", "map"] }),
    ]);
  };

  return {
    choques,
    choquesDe: (quotationId: string) =>
      choques.filter((c) => c.quotation_id === quotationId),
    /** Tiene tope de calendario: borde rojo. */
    conTope: (quotationId: string) =>
      choques.some((c) => c.quotation_id === quotationId),
    guardandoDe: (quotationId: string) => guardando === quotationId,
    seguir,
  };
}
