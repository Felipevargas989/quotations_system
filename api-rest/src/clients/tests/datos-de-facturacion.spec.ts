import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { datosDeFacturacionLimpios } from '../../facturacion/datos-del-receptor';
import { mockPinoLogger } from '../../testing/mocks';
import { ClientsService } from '../clients.service';
import { UpdateClientDto } from '../dto/update-client.dto';

/**
 * LOS DATOS DE FACTURACIÓN DEL CLIENTE (migración 184, doc 19 §5.1).
 * Lo que se guarda en la ficha va tal cual a la factura de facturacion.cl:
 * el RUT con su dígito verificador, los largos que caben en el archivo y
 * los correos a los que facturacion.cl le manda el documento.
 *
 * Los RUT no son inventados: 77.701.305-K es Valle del Sol Quillón SpA y
 * 90.413.000-1 es CCU.
 */
const errores = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(UpdateClientDto, body))).map(
    (e) => e.property,
  );

describe('Los datos de facturación: lo que acepta el motor', () => {
  it('una ficha completa pasa', async () => {
    expect(
      await errores({
        rut: '90.413.000-1',
        razon_social: 'Compañía Cervecerías Unidas S.A.',
        giro: 'Elaboración de cervezas',
        direccion_facturacion: 'Av. Vitacura 2670, piso 23',
        comuna: 'Las Condes',
        ciudad: 'Santiago',
        correo_facturacion: 'facturas@ccu.cl, pagos@ccu.cl',
        referencias_exigidas: ['801', '802'],
      }),
    ).toEqual([]);
  });

  it('todo se puede borrar: null, vacío o la lista vacía', async () => {
    expect(
      await errores({
        rut: null,
        razon_social: '',
        giro: null,
        correo_facturacion: '',
        referencias_exigidas: [],
      }),
    ).toEqual([]);
  });

  it('el RUT se revisa de verdad: un dígito verificador malo no pasa', async () => {
    expect(await errores({ rut: '77.701.305-1' })).toEqual(['rut']);
    expect(await errores({ rut: '77.701.305-K' })).toEqual([]);
  });

  it('lo que no cabe en la factura no se guarda (el giro, hasta 40)', async () => {
    expect(await errores({ giro: 'x'.repeat(41) })).toEqual(['giro']);
    expect(await errores({ giro: 'x'.repeat(40) })).toEqual([]);
    expect(await errores({ comuna: 'x'.repeat(21) })).toEqual(['comuna']);
  });

  it('los correos: uno o varios, todos válidos', async () => {
    expect(await errores({ correo_facturacion: 'pagos@ccu' })).toEqual([
      'correo_facturacion',
    ]);
    expect(
      await errores({ correo_facturacion: 'facturas@ccu.cl; pagos@ccu.cl' }),
    ).toEqual([]);
  });

  it('solo las referencias de la lista del SII', async () => {
    expect(await errores({ referencias_exigidas: ['801', '999'] })).toEqual([
      'referencias_exigidas',
    ]);
    expect(await errores({ referencias_exigidas: ['HES'] })).toEqual([]);
  });
});

describe('Los datos de facturación: cómo quedan guardados', () => {
  it('el RUT, limpio: sin puntos y con la K mayúscula', () => {
    expect(datosDeFacturacionLimpios({ rut: '77.701.305-k' })).toEqual({
      rut: '77701305-K',
    });
  });

  it('una casilla vacía queda en null, y los espacios sobran', () => {
    expect(
      datosDeFacturacionLimpios({
        rut: '',
        giro: '   ',
        razon_social: '  Compañía   Cervecerías Unidas S.A. ',
      }),
    ).toEqual({
      rut: null,
      giro: null,
      razon_social: 'Compañía Cervecerías Unidas S.A.',
    });
  });

  it('los correos, en minúscula y separados por coma', () => {
    expect(
      datosDeFacturacionLimpios({
        correo_facturacion: ' Facturas@CCU.cl;pagos@ccu.cl ',
      }),
    ).toEqual({ correo_facturacion: 'facturas@ccu.cl, pagos@ccu.cl' });
  });

  it('las referencias, sin repetir y en el orden del SII', () => {
    expect(
      datosDeFacturacionLimpios({
        referencias_exigidas: ['HES', '802', '801', '802'],
      }),
    ).toEqual({ referencias_exigidas: ['801', '802', 'HES'] });
  });

  it('solo toca lo que venía: guardar las notas no borra el RUT', () => {
    expect(datosDeFacturacionLimpios({})).toEqual({});
  });

  it('un RUT que no se puede leer se frena (si alguien se salta el DTO)', () => {
    expect(() => datosDeFacturacionLimpios({ rut: 'abc' })).toThrow(
      BadRequestException,
    );
  });

  it('el servicio los limpia antes de guardar, en la empresa de la sesión', async () => {
    const repo = { update: jest.fn().mockResolvedValue({ id: 'c-1' }) };
    // Orden real del constructor: clientes, personas, usuarios, logger.
    const service = new ClientsService(
      repo as never,
      {} as never,
      {} as never,
      mockPinoLogger() as never,
    );

    await service.update(
      'c-1',
      { rut: '90.413.000-1', giro: '  Cervecería  ', notes: 'pide OC' },
      7,
    );

    expect(repo.update).toHaveBeenCalledWith(
      'c-1',
      { rut: '90413000-1', giro: 'Cervecería', notes: 'pide OC' },
      7,
    );
  });
});
