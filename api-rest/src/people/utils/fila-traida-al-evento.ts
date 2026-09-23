/**
 * LA FILA QUE LA FICHA TRAE AL EVENTO por un citado al restaurante ese
 * día (Felipe, 22-09: "los que estén citados como staff ese día, que
 * puede ser un freelance o gente de planta, y la gente de planta").
 *  · Planta con turno: como desde el 18-08, `kind = 'planta'`, sin
 *    monto (la asignación extra se escribe después) y CON propina.
 *  · Citado como staff (freelance, o planta en un día extra): fila
 *    solo-de-propina, sin monto (su jornada la paga el día de staff) y
 *    con "sin propina" YA MARCADO, porque su propina la recibe en el
 *    día; Felipe lo desmarca si ese día merece también la del evento.
 * La pantalla muestra "planta" o "staff" en el monto según el caso.
 */
export const filaTraidaAlEvento = (
  companyId: number,
  quotationId: string,
  t: {
    person_id: number | null;
    day: string;
    role_id?: number | null;
    kind?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    break_minutes?: number | null;
  },
) => {
  const esPlanta = (t.kind ?? 'planta') === 'planta';
  return {
    company_id: companyId,
    quotation_id: quotationId,
    person_id: t.person_id,
    day: String(t.day).slice(0, 10),
    role_id: t.role_id ?? null,
    kind: esPlanta ? 'planta' : (t.kind ?? 'freelance'),
    status: 'confirmado',
    amount: null,
    solo_propina: !esPlanta,
    no_tip: !esPlanta,
    starts_at: t.starts_at,
    ends_at: t.ends_at,
    break_minutes: t.break_minutes,
  };
};
