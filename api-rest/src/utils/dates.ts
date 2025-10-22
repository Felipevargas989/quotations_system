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
