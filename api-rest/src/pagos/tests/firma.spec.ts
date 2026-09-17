import { createHmac } from 'crypto';
import { verificarFirmaMercadoPago } from '../firma';

/**
 * LA FIRMA DEL WEBHOOK DE PAGOS (16-09-2026, sprint B del paso 4+5).
 *
 * La puerta de verdad del webhook es esta firma: si deja pasar un aviso
 * falso, cualquiera activa planes gratis; si rechaza uno bueno, ningún
 * pago activa nada. Las pruebas cubren los dos lados.
 */

const SECRETO = 'un-secreto-de-prueba';

const firmar = (dataId: string, requestId: string, ts: string) => {
  const manifiesto = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  return createHmac('sha256', SECRETO).update(manifiesto).digest('hex');
};

const ahora = () => String(Math.floor(Date.now() / 1000));

describe('la firma de los avisos de Mercado Pago', () => {
  it('acepta una firma bien hecha', () => {
    const ts = ahora();
    const v1 = firmar('12345', 'req-1', ts);
    expect(
      verificarFirmaMercadoPago(
        SECRETO,
        { xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'req-1' },
        '12345',
      ),
    ).toBe(true);
  });

  it('el data.id alfanumérico se firma en minúsculas, como manda el proveedor', () => {
    const ts = ahora();
    const v1 = firmar('ABC123', 'req-1', ts);
    expect(
      verificarFirmaMercadoPago(
        SECRETO,
        { xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'req-1' },
        'ABC123',
      ),
    ).toBe(true);
  });

  it('rechaza una firma adulterada', () => {
    const ts = ahora();
    const v1 = firmar('12345', 'req-1', ts).replace(/^./, '0');
    const v2 = firmar('12345', 'req-1', ts).replace(/^0/, '1');
    const adulterada = v1 === firmar('12345', 'req-1', ts) ? v2 : v1;
    expect(
      verificarFirmaMercadoPago(
        SECRETO,
        { xSignature: `ts=${ts},v1=${adulterada}`, xRequestId: 'req-1' },
        '12345',
      ),
    ).toBe(false);
  });

  it('rechaza el aviso de otro id aunque la firma sea legítima', () => {
    const ts = ahora();
    const v1 = firmar('12345', 'req-1', ts);
    expect(
      verificarFirmaMercadoPago(
        SECRETO,
        { xSignature: `ts=${ts},v1=${v1}`, xRequestId: 'req-1' },
        '99999',
      ),
    ).toBe(false);
  });

  it('rechaza un aviso viejo: una notificación capturada no sirve para siempre', () => {
    const viejo = String(Math.floor(Date.now() / 1000) - 600);
    const v1 = firmar('12345', 'req-1', viejo);
    expect(
      verificarFirmaMercadoPago(
        SECRETO,
        { xSignature: `ts=${viejo},v1=${v1}`, xRequestId: 'req-1' },
        '12345',
      ),
    ).toBe(false);
  });

  it('sin cabecera de firma no entra nadie', () => {
    expect(verificarFirmaMercadoPago(SECRETO, {}, '12345')).toBe(false);
  });

  describe('sin secreto configurado', () => {
    const nodeEnv = process.env.NODE_ENV;
    afterEach(() => {
      process.env.NODE_ENV = nodeEnv;
    });

    it('en producción RECHAZA todo (fail-closed, como el de Resend)', () => {
      process.env.NODE_ENV = 'production';
      const avisos: string[] = [];
      expect(
        verificarFirmaMercadoPago(undefined, {}, '1', (m) => avisos.push(m)),
      ).toBe(false);
      expect(avisos[0]).toContain('RECHAZADO');
    });

    it('en desarrollo deja pasar, pero avisa en el log', () => {
      process.env.NODE_ENV = 'test';
      const avisos: string[] = [];
      expect(
        verificarFirmaMercadoPago(undefined, {}, '1', (m) => avisos.push(m)),
      ).toBe(true);
      expect(avisos[0]).toContain('sin verificar');
    });
  });
});
