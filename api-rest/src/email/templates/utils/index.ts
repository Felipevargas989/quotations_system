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

// Cura de inyección (revisión 05-08): TODO dato del visitante que se
// interpola en el HTML de un correo pasa por acá — sin esto, un lead
// malicioso mete marcado (o peor) en la casilla del admin.
export const escaparHtml = (s: string | null | undefined): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Asuntos con datos del visitante: sin CR/LF (inyección de cabeceras)
// y con tope de largo.
export const sanearAsunto = (s: string, tope = 120): string =>
  s.replace(/[\r\n]+/g, ' ').slice(0, tope);
