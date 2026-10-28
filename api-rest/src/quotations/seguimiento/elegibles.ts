// QUÉ COTIZACIONES ENTRAN AL SEGUIMIENTO CON IA (doc 18, sección 2).
//
// Felipe, 17-10-2026: "todas las que requieran seguimiento porque esté
// vencida la próxima acción, y que su próxima acción sea un correo". Y con
// la 607 a la vista: el botoncito de la nota que deja la fecha ES el tipo
// del próximo contacto; no se agrega ningún campo.

export type NotaDeBitacora = {
  created_at: string;
  tipo: string | null;
  note: string | null;
  author_name?: string | null;
  next_contact_date: string | null;
  next_contact_done_at: string | null;
};

/** Una solicitada nunca salió: no es seguimiento. */
export const ESTADOS_CON_SEGUIMIENTO = ['enviada', 'en_negociacion'];

/** El compromiso vivo: el de la nota más reciente con fecha, salvo que ya
 *  se haya dado por cumplido (entonces no hay ninguno: las anteriores
 *  quedaron resueltas por ella; 28-10-2026). Es la misma regla del semáforo
 *  de la lista (QuotationFollowupsService.mapByCompany) y del «Contacto
 *  comprometido» del panel. */
export function compromisoVivo(notas: NotaDeBitacora[]): NotaDeBitacora | null {
  const ultima = [...notas]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .find((n) => n.next_contact_date);
  return ultima && !ultima.next_contact_done_at ? ultima : null;
}

/** "15-10" de un AAAA-MM-DD. */
export const ddmm = (iso: string): string =>
  `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

/** Hoy en Chile, AAAA-MM-DD: la fecha del próximo contacto es de Chile. */
export const fechaEnChile = (momento: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(momento);

/** null si la cotización entra; si no, por qué, en una línea. */
export function porQueNoEntra(
  estado: string,
  notas: NotaDeBitacora[],
  hoy: string,
): string | null {
  if (!ESTADOS_CON_SEGUIMIENTO.includes(estado)) {
    return `está en «${estado}»: el seguimiento es para enviadas y en negociación.`;
  }
  const compromiso = compromisoVivo(notas);
  if (!compromiso?.next_contact_date) return 'no tiene próximo contacto.';
  const fecha = compromiso.next_contact_date.slice(0, 10);
  if (fecha >= hoy) {
    return `su próximo contacto es el ${ddmm(fecha)}: todavía no vence.`;
  }
  if (compromiso.tipo !== 'correo') {
    return `su próximo contacto es por ${compromiso.tipo ?? 'otro medio'}, no por correo.`;
  }
  return null;
}

/** Un correo que sirve para escribirle al cliente: con forma de correo y
 *  que no sea de relleno (noindica@, sincorreo@…). */
export const esCorreoUtil = (c: string | null | undefined): c is string =>
  Boolean(c) &&
  /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((c as string).trim()) &&
  !/^(no-?indica|sin-?correo|no-?tiene|nn)@/i.test((c as string).trim());
