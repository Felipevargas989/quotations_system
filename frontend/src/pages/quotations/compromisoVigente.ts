/**
 * EL COMPROMISO VIGENTE DE UNA BITÁCORA (28-10-2026): el de la nota más
 * nueva que tenga fecha, salvo que ya se haya dado por cumplido («Listo»):
 * entonces no queda ninguno, porque las notas anteriores quedaron resueltas
 * por ella. Las notas sin fecha no lo mueven (07-08: en Post-Venta casi
 * todo se anota sin fecha).
 *
 * Hasta el 28-10-2026 se tomaba la más nueva SIN cumplir, y cada «Listo»
 * hacía aparecer la anterior, nota por nota. Felipe, en Post-Venta: "pincho
 * listo y se corre hacia abajo… no ponerle listo todo el historial".
 *
 * Es la misma regla del motor: `QuotationFollowupsService.mapByCompany` (el
 * semáforo y el aviso de Post-Venta) y `compromisoVivo` del seguimiento con
 * IA.
 */
export function compromisoVigente<
  T extends {
    created_at: string;
    next_contact_date?: string | null;
    next_contact_done_at?: string | null;
  },
>(notas: readonly T[]): T | null {
  let ultima: T | null = null;
  for (const n of notas) {
    if (!n.next_contact_date) continue;
    if (!ultima || n.created_at > ultima.created_at) ultima = n;
  }
  return ultima && !ultima.next_contact_done_at ? ultima : null;
}
