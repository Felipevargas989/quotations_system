/**
 * "Tu semana en Eventia" — resumen semanal interno (lunes) que fusiona
 * los antiguos correos diarios "eventos en 3 días" y "resumen de
 * cotizaciones" (decisión anti-spam de Felipe, 29-07-2026).
 */
export interface WeeklyDigestParams {
  companyName: string;
  /** Ej: "semana del 3 al 9 de agosto" */
  weekLabel: string;
  eventos: {
    fecha: string; // dd/mm
    tipo: string;
    personas?: number | null;
  }[];
  pipeline: {
    solicitadas: number;
    enviadas: number;
    enNegociacion: number;
  };
}
