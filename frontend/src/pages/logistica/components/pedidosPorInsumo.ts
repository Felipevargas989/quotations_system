// Qué cotizaciones marcadas pide cada insumo de la lista de compra
// (20-10-2026). Lo dibuja QuienLoPide; vive aparte para que ese archivo
// exporte solo el componente.

export interface PedidoDeInsumo {
  readonly eventoId: string;
  readonly numero: number;
  readonly cliente: string;
  readonly fecha: string | null;
  /** Neta, en la unidad base del insumo (kg / L / u). */
  readonly cantidad: number;
  readonly provisionado: boolean;
}

interface EventoMarcado {
  readonly id: string;
  readonly quotation_number: number;
  readonly client_name: string;
  readonly event_date: string | null;
}

/** Insumo → las cotizaciones marcadas que lo piden, en el orden recibido. */
export function pedidosPorInsumo(
  eventos: readonly EventoMarcado[],
  usoDe: (eventoId: string) => ReadonlyMap<number, number> | undefined,
  provisionadosDe: (eventoId: string) => ReadonlySet<number> | undefined,
): Map<number, PedidoDeInsumo[]> {
  const porInsumo = new Map<number, PedidoDeInsumo[]>();
  for (const ev of eventos) {
    const provisionados = provisionadosDe(ev.id);
    usoDe(ev.id)?.forEach((cantidad, insumoId) => {
      const lista = porInsumo.get(insumoId) ?? [];
      lista.push({
        eventoId: ev.id,
        numero: ev.quotation_number,
        cliente: ev.client_name,
        fecha: ev.event_date,
        cantidad,
        provisionado: provisionados?.has(insumoId) ?? false,
      });
      porInsumo.set(insumoId, lista);
    });
  }
  return porInsumo;
}
