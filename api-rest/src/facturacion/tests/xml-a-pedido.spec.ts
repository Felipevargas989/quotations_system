import { BadRequestException } from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import { NotasService } from '../notas/notas.service';

/**
 * EL XML A PEDIDO (doc 19 §9.33): facturacion.cl lo entrega con
 * `getXMLDte`, que en producción no está contratado (08-11-2026).
 */

const ADMIN = { id: 'u-felipe', company_id: 1, role: 'administrador' } as never;

const FACTURA_381 = {
  id: 1,
  company_id: 1,
  tipo: 33,
  ambiente: 'produccion',
  folio: 381,
  estado: 'emitido',
};

/** Lo que responde facturacion.cl cuando no entrega el XML. */
const armar = (mensaje: string) => {
  const obtenerXml = jest.fn().mockResolvedValue({ base64: null, mensaje });
  const servicio = new NotasService(
    { documento: jest.fn().mockResolvedValue(FACTURA_381) } as never,
    {} as never,
    { de: () => ({ ambiente: 'produccion', obtenerXml }) } as never,
    {} as never,
    mockPinoLogger() as never,
    {} as never,
  );
  return { servicio, obtenerXml };
};

describe('El XML a pedido (§9.33)', () => {
  it('sin contratar, lo dice en una línea (producción, 08-11)', async () => {
    const { servicio, obtenerXml } = armar(
      'Esta opcion es un servicio adicional solo para clientes que lo contraten.',
    );
    const error = await servicio.pedirXml(ADMIN, 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(
      'El XML es un servicio adicional de facturacion.cl y no está contratado.',
    );
    expect(obtenerXml).toHaveBeenCalledWith(33, 381);
  });

  it('si no lo entrega por otra razón, dice lo que respondió', async () => {
    const { servicio } = armar('Folio no existe');
    await expect(servicio.pedirXml(ADMIN, 1)).rejects.toThrow(
      'facturacion.cl no entregó el XML: Folio no existe',
    );
  });
});
