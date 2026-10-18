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
//
// «Hay que gestionar» no lo hace desaparecer (Felipe, 18-10: "se puede
// olvidar"): queda «Tope de calendario», con borde rojo en la tarjeta y en
// el hilo de seguimiento, hasta que el tope se resuelva o alguien apriete
// «Sí, puede seguir».

export function useChoquesDeFecha() {
  const queryClient = useQueryClient();
  const choquesQuery = useQuery({
    // Bajo "quotations": cambiar un estado o una fecha ya refresca esa
    // familia, y con ella los choques.
    queryKey: ["quotations", "choques-de-fecha"],
    staleTime: 60_000,
    queryFn: getChoquesDeFecha,
  });
  /** La cotización cuya decisión se está guardando. */
  const [decidiendo, setDecidiendo] = useState<string | null>(null);
  const choques = choquesQuery.data ?? [];

  /** Una decisión para uno o varios choques de la MISMA cotización: los
   *  topes de calendario se cierran todos con un solo «Sí, puede seguir». */
  const decidir = async (
    lista: ChoqueDeFecha[],
    decision: DecisionDelChoque,
  ) => {
    if (lista.length === 0) return;
    const { quotation_id: id, quotation_number: numero } = lista[0];
    setDecidiendo(id);
    let hechas = 0;
    try {
      for (const c of lista) {
        await decidirChoque(c.quotation_id, c.aceptada.id, decision);
        hechas++;
      }
      toast.success(
        decision === "puede_seguir"
          ? `N° ${numero}: sigue con su fecha${lista.length > 1 ? ` (${lista.length} topes revisados)` : ""}. Quedó anotado en el seguimiento.`
          : `N° ${numero}: quedó una llamada para hoy en el seguimiento (mover la fecha o descartar) y la marca «Tope de calendario».`,
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
      setDecidiendo(null);
    }
    // La línea nueva de la bitácora, el semáforo y la lista de choques.
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
    /** Se apretó «Hay que gestionar» y el tope sigue: borde rojo. */
    conTope: (quotationId: string) =>
      choques.some(
        (c) => c.quotation_id === quotationId && c.estado === "gestionar",
      ),
    decidiendo,
    decidir,
  };
}
