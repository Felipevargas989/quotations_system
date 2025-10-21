// Helper function to format currency
export const formatCurrency = (amount: number): string => {
  return amount.toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

// Helper function to format date
export const formatDate = (date: Date | string): string => {
  const dateObj = new Date(date);
  return dateObj.toISOString().split('T')[0];
};
