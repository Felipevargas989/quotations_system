export const getEventDateUtc = (event_date: string): string => {
  const newDate = new Date(event_date + 'T00:00:00Z');
  return newDate.toISOString();
};

/**
 * Normalize date to UTC 00:00:00
 * @param date - Date to normalize
 * @returns Date in UTC
 */
export const normalizeDateToUtc = (date: Date): Date => {
  return new Date(date.setUTCHours(0, 0, 0, 0));
};

/**
 * El instante en que empezó el mes en curso EN CHILE, listo para comparar
 * contra `created_at` (que la base guarda en UTC).
 *
 * Por qué no basta con el mes UTC: una cotización creada el 31 de agosto a
 * las 21:30 en Chile ya es 1 de septiembre en UTC, y le quemaría al cliente
 * una cotización del mes siguiente. El tope de 20 del plan Cotiza se cuenta
 * por mes chileno, que es el que el cliente tiene en la cabeza.
 *
 * Sin librerías: se le pregunta al propio motor de zonas horarias qué día
 * es en Santiago y cuánto está corriendo el reloj ese día (el país cambia
 * de hora en septiembre y en abril).
 */
export const inicioDelMesEnChile = (ahora: Date = new Date()): Date => {
  const enChile = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
  }).format(ahora);
  const [anio, mes] = enChile.split('-').map(Number);

  // Medianoche del día 1 leída como si fuera UTC, y después corrida por el
  // desfase que Chile tenga ESE día (-3 en verano, -4 en invierno).
  const comoSiFueraUtc = new Date(Date.UTC(anio, mes - 1, 1, 0, 0, 0));
  const desfaseMs =
    new Date(
      comoSiFueraUtc.toLocaleString('en-US', { timeZone: 'UTC' }),
    ).getTime() -
    new Date(
      comoSiFueraUtc.toLocaleString('en-US', { timeZone: 'America/Santiago' }),
    ).getTime();
  return new Date(comoSiFueraUtc.getTime() + desfaseMs);
};
