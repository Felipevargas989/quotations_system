export interface LeadData {
  nombre: string;
  telefono: string;
  email: string;
  nombre_empresa: string;
  personas_empresa: string;
  ventas_anuales: string;
  /** Huellas del aterrizaje (migración 116); el motor decide la etiqueta. */
  origen_detalle?: Record<string, string>;
}

export interface RegisterLeadResponse {
  success: boolean;
  data?: any;
  error?: string;
}
