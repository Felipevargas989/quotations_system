/**
 * LO QUE REALMENTE SALIÓ DE CAJA HACIA EL EQUIPO (Felipe, 29-08-2026).
 *
 * Regla suya, dicha así: el costo de personal entra al flujo de caja
 * "cuando los marque como pagados en la pestaña de nómina". No cuando
 * se hizo el evento, no cuando se armó la nómina: cuando se pagó.
 *
 * Por eso la fecha que manda es `paid_at` de la nómina, y jornada y
 * propina viajan separadas: se marcan por separado y se pueden pagar
 * en días distintos.
 *
 * La propina VA incluida aquí a propósito, aunque el margen del panel
 * la excluya: en el resultado no es costo (la paga el cliente y pasa
 * entera al equipo), pero en la CAJA sí es plata que sale.
 *
 * La clave del mes es `año-mesBase0`, la misma que usa el panel.
 */

export interface PagoDeNomina {
  payroll_id: number;
  person_id: number;
  jornada_paid: boolean | null;
  propina_paid: boolean | null;
  paid_at: string | null;
}

export interface SillaDeNomina {
  person_id: number | null;
  payroll_id: number | null;
  tip_payroll_id: number | null;
  amount: number | null;
  tip_amount: number | null;
}

export interface PagadoDelMes {
  jornadas: number;
  propinas: number;
}

const llaveDelMes = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
};

export const pagadoDePersonalPorMes = (
  pagos: readonly PagoDeNomina[],
  sillas: readonly SillaDeNomina[],
): Record<string, PagadoDelMes> => {
  // Índices por (nómina, persona): una persona puede tener varias
  // sillas en la misma nómina (varios días del mismo evento, o varios
  // eventos) y todas se pagan de una.
  const porJornada = new Map<string, number>();
  const porPropina = new Map<string, number>();
  for (const s of sillas) {
    if (s.person_id == null) continue;
    if (s.payroll_id != null) {
      const k = `${s.payroll_id}|${s.person_id}`;
      porJornada.set(k, (porJornada.get(k) ?? 0) + Number(s.amount ?? 0));
    }
    if (s.tip_payroll_id != null) {
      const k = `${s.tip_payroll_id}|${s.person_id}`;
      porPropina.set(k, (porPropina.get(k) ?? 0) + Number(s.tip_amount ?? 0));
    }
  }

  const meses: Record<string, PagadoDelMes> = {};
  for (const p of pagos) {
    if (!p.paid_at) continue;
    const mes = llaveDelMes(p.paid_at);
    const casilla = (meses[mes] ??= { jornadas: 0, propinas: 0 });
    const k = `${p.payroll_id}|${p.person_id}`;
    if (p.jornada_paid) casilla.jornadas += porJornada.get(k) ?? 0;
    if (p.propina_paid) casilla.propinas += porPropina.get(k) ?? 0;
  }
  return meses;
};
