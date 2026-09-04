/**
 * LA PREGUNTA DEL DÍA EXTRA (Felipe, 04-09 — capítulo 11 del documento
 * de arquitectura): el tipo del día fuera de patrón lo elige el usuario
 * y viaja explícito. Estas piezas puras guardan las dos consecuencias:
 * el freelance elegido exige monto, y toda alta revive la fila dormida.
 */

interface PersonaMinima {
  default_kind?: string | null;
}

interface AltaMinima {
  quotation_id?: string | null;
  kind?: string | null;
  amount?: number | null;
}

/**
 * El freelance ELEGIDO en el restaurante exige su monto: sin plata
 * definida, esa jornada aparece después en la nómina sin saber cuánto
 * pagarle — el problema que el módulo vino a resolver. Los eventos no
 * pasan por acá: su silla trae el valor.
 */
export const faltaElMontoDelFreelance = (
  dto: AltaMinima,
  persona: PersonaMinima,
): boolean =>
  !dto.quotation_id &&
  dto.kind === 'freelance' &&
  persona.default_kind === 'planta' &&
  (dto.amount == null || dto.amount <= 0);

/**
 * Los cambios con que se despierta una fila dormida (ajuste 'descansa',
 * migración 89): re-agregar el día la REVIVE en vez de chocar con la
 * llave única persona+día ("esa persona ya está puesta ese día").
 */
export const cambiosParaRevivir = (p: {
  kind: string;
  ajuste?: string | null;
  role_id?: number | null;
  roleDormida?: number | null;
  amount?: number | null;
  status?: string | null;
}): Record<string, unknown> => ({
  ajuste: p.ajuste ?? null,
  kind: p.kind,
  role_id: p.role_id ?? p.roleDormida ?? null,
  amount: p.kind === 'planta' ? null : (p.amount ?? null),
  status: p.status ?? (p.kind === 'planta' ? 'confirmado' : 'por_confirmar'),
  puesto_en: new Date().toISOString(),
});

/**
 * El horario que le toca a una persona un día dado, bajando la
 * escalera: lo que venga escrito para ese día > su horario de ESE día
 * de la semana > su horario único de la ficha > el estándar de la casa
 * (09:00 a 19:00 con una hora de colación).
 */
export const horarioDelDia = (
  persona: {
    weekly_schedule?: Record<
      string,
      { in?: string; out?: string; break?: number }
    > | null;
    default_starts_at?: string | null;
    default_ends_at?: string | null;
    default_break_minutes?: number | null;
  },
  dia: string,
  escrito?: {
    starts_at?: string | null;
    ends_at?: string | null;
    break_minutes?: number | null;
  },
) => {
  const diaSemana = String(new Date(`${dia}T00:00:00Z`).getUTCDay());
  const suyo = persona.weekly_schedule?.[diaSemana];
  return {
    starts_at:
      escrito?.starts_at ??
      suyo?.in ??
      persona.default_starts_at?.slice(0, 5) ??
      '09:00',
    ends_at:
      escrito?.ends_at ??
      suyo?.out ??
      persona.default_ends_at?.slice(0, 5) ??
      '19:00',
    break_minutes:
      escrito?.break_minutes ??
      suyo?.break ??
      persona.default_break_minutes ??
      60,
  };
};
