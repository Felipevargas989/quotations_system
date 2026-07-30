import { baseLayoutTemplate } from '../baseLayout';
import { fmtCLP } from '../brandLayout';

export interface PortalReceiptAdminParams {
  companyName: string;
  mandante: string;
  clienteEmpresa: string;
  quotationNumber: number;
  cuotaNumero: number;
  monto: number;
}

/**
 * Aviso INTERNO (Fase 2b): un cliente subió un comprobante desde el
 * portal y espera confirmación en Post-Venta.
 */
export const portalReceiptAdminTemplate = (
  params: PortalReceiptAdminParams,
): string => {
  const content = `
    <p style="font-size:16px;font-weight:700;margin:0 0 14px;">💸 Comprobante recibido por el portal</p>
    <p style="margin:0 0 10px;"><b>${params.mandante}</b>${
      params.clienteEmpresa && params.clienteEmpresa !== params.mandante
        ? ` (${params.clienteEmpresa})`
        : ''
    } declara haber transferido <b>${fmtCLP(params.monto)}</b> por la
    cuota ${params.cuotaNumero} de la cotización
    <b>N° ${params.quotationNumber}</b>.</p>
    <p style="margin:0 0 10px;">El pago NO está registrado todavía: entra a
    <b>Post-Venta → Comprobantes</b>, revisa el archivo y confírmalo o
    recházalo.</p>
  `;
  return baseLayoutTemplate({ content });
};
