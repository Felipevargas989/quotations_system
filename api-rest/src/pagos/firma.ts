import { createHmac, timingSafeEqual } from 'crypto';

// LA FIRMA DE LOS AVISOS DE MERCADO PAGO (16-09-2026, sprint B del
// paso 4+5). Calcada del patrón de la casa para Resend
// (bajas.service.verificarFirmaSvix), con las diferencias del
// proveedor: Mercado Pago firma un "manifiesto" armado con el id del
// aviso (query `data.id`), el header `x-request-id` y el `ts` que
// viaja dentro del propio `x-signature` — no firma el cuerpo. El
// resultado viaja en hexadecimal, no en base64.
//
// Documentación consultada el 15-09-2026 (plan §2): el manifiesto es
//   id:{data.id};request-id:{x-request-id};ts:{ts};
// y cada pedazo SE OMITE si su valor no llegó. El data.id alfanumérico
// va en minúsculas.

export type CabecerasDelAviso = {
  /** El header `x-signature`: "ts=...,v1=..." */
  xSignature?: string;
  /** El header `x-request-id`. */
  xRequestId?: string;
};

/**
 * Verifica la firma de un aviso. Fail-closed como el de Resend desde
 * la revisión del 26-08: sin secreto configurado, en producción se
 * RECHAZA todo — un webhook de pagos abierto dejaría a cualquiera
 * activar planes a punta de avisos falsos.
 */
export function verificarFirmaMercadoPago(
  secreto: string | undefined | null,
  cabeceras: CabecerasDelAviso,
  dataId: string | undefined | null,
  avisar: (mensaje: string) => void = () => undefined,
): boolean {
  if (!secreto) {
    if (process.env.NODE_ENV === 'production') {
      avisar('webhook de pagos sin MP_WEBHOOK_SECRET: RECHAZADO');
      return false;
    }
    avisar('webhook de pagos sin MP_WEBHOOK_SECRET: sin verificar');
    return true;
  }
  if (!cabeceras.xSignature) return false;

  const partes = new Map<string, string>();
  for (const pedazo of cabeceras.xSignature.split(',')) {
    const [clave, ...resto] = pedazo.split('=');
    if (clave && resto.length) partes.set(clave.trim(), resto.join('=').trim());
  }
  const ts = partes.get('ts');
  const v1 = partes.get('v1');
  if (!ts || !v1) return false;

  // Anti-replay ±5 minutos, igual que el verificador de Svix: una
  // notificación capturada no sirve para siempre. El ts de Mercado
  // Pago llega en segundos o en milisegundos según la antigüedad de la
  // integración; se aceptan ambos.
  const numero = Number(ts);
  if (!Number.isFinite(numero)) return false;
  const segundos = numero > 1_000_000_000_000 ? numero / 1000 : numero;
  if (Math.abs(Date.now() / 1000 - segundos) > 300) return false;

  // El manifiesto, tal como lo documenta el proveedor: cada pedazo se
  // omite si no llegó su valor; el id alfanumérico va en minúsculas.
  let manifiesto = '';
  if (dataId) manifiesto += `id:${dataId.toLowerCase()};`;
  if (cabeceras.xRequestId) manifiesto += `request-id:${cabeceras.xRequestId};`;
  manifiesto += `ts:${ts};`;

  const esperada = createHmac('sha256', secreto)
    .update(manifiesto)
    .digest('hex');
  const dada = Buffer.from(v1, 'hex');
  const buena = Buffer.from(esperada, 'hex');
  return dada.length === buena.length && timingSafeEqual(dada, buena);
}
