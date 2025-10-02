// Helper function to generate all months between start and end dates
export const generateMonthRange = (
  start: Date,
  end: Date,
): Record<string, number> => {
  const result: Record<string, number> = {};
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (current <= endMonth) {
    const monthYear = `${current.getFullYear()}-${current.getMonth()}`;
    result[monthYear] = 0;
    current.setMonth(current.getMonth() + 1);
  }

  return result;
};
