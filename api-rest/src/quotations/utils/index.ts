export const getEventDateUtc = (event_date: string): Date => {
  return new Date(event_date + 'T00:00:00Z');
};
