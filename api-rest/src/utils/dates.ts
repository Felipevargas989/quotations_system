export const getEventDateUtc = (event_date: string): string => {
  const newDate = new Date(event_date + 'T00:00:00Z');
  return newDate.toISOString();
};
