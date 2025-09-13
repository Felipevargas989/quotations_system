export interface LeadData {
  nombre: string;
  telefono: string;
  email: string;
  nombre_empresa: string;
  personas_empresa: string;
  ventas_anuales: string;
}

export interface RegisterLeadResponse {
  success: boolean;
  data?: any;
  error?: string;
}
