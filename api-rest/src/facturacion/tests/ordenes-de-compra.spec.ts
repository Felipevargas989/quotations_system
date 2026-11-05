import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CrearOrdenDeCompraDto,
  EditarOrdenDeCompraDto,
} from '../ordenes-de-compra/orden-de-compra.dto';
import { OrdenesDeCompraService } from '../ordenes-de-compra/ordenes-de-compra.service';

/**
 * LAS ÓRDENES DE COMPRA DE UN EVENTO (doc 19, paso 2a). El caso es real:
 * el evento #481 de Santo Tomás tiene 3 OC a 2 RUT. La 3 de 3 es del
 * Instituto Profesional (65.175.239-6), N° 32000066941, del 14-10-2026.
 */
const OC3 = {
  numero: '32000066941',
  fecha: '2026-10-14',
  rut: '65.175.239-6',
  razon_social: 'Corporación Instituto Profesional Santo Tomás',
  descripcion: 'Fiesta de Navidad Santo Tomás 2026, adultos 78 y niños 23',
  total: 2619929,
  documento_id: 261,
};

const errores = async (
  clase: typeof CrearOrdenDeCompraDto | typeof EditarOrdenDeCompraDto,
  body: Record<string, unknown>,
) => (await validate(plainToInstance(clase, body))).map((e) => e.property);

describe('Una orden de compra: lo que acepta el motor', () => {
  it('una completa pasa', async () => {
    expect(await errores(CrearOrdenDeCompraDto, OC3)).toEqual([]);
  });

  it('el N°, la fecha y el total son obligatorios', async () => {
    expect(await errores(CrearOrdenDeCompraDto, {})).toEqual([
      'numero',
      'fecha',
      'total',
    ]);
  });

  it('el N° cabe en la referencia del SII (18) y el RUT se revisa de verdad', async () => {
    expect(
      await errores(CrearOrdenDeCompraDto, {
        ...OC3,
        numero: '1234567890123456789',
        rut: '65.175.239-5',
      }),
    ).toEqual(['numero', 'rut']);
  });

  it('los montos van en pesos enteros, y el total mayor que cero', async () => {
    expect(
      await errores(CrearOrdenDeCompraDto, { ...OC3, total: 0, neto: 10.5 }),
    ).toEqual(['neto', 'total']);
  });

  it('al editar, basta lo que cambia', async () => {
    expect(await errores(EditarOrdenDeCompraDto, { total: 2805778 })).toEqual(
      [],
    );
  });
});

describe('Las órdenes de compra de un evento', () => {
  const armar = ({ deLaEmpresa = true, documentoDelEvento = true } = {}) => {
    const repo = {
      cotizacionDeLaEmpresa: jest.fn().mockResolvedValue(deLaEmpresa),
      documentoDeLaCotizacion: jest.fn().mockResolvedValue(documentoDelEvento),
      deCotizacion: jest.fn().mockResolvedValue([]),
      crear: jest
        .fn()
        .mockImplementation((fila: object) =>
          Promise.resolve({ id: 1, ...fila }),
        ),
      editar: jest.fn().mockResolvedValue({ id: 1 }),
      borrar: jest.fn().mockResolvedValue(1),
    };
    return { repo, service: new OrdenesDeCompraService(repo as never) };
  };
  const dto = () => plainToInstance(CrearOrdenDeCompraDto, OC3);

  it('se guarda limpia, en el evento y la empresa de la sesión, con quién la cargó', async () => {
    const { repo, service } = armar();
    await service.crear('ev-481', 1, dto(), 'felipe');
    expect(repo.cotizacionDeLaEmpresa).toHaveBeenCalledWith('ev-481', 1);
    expect(repo.documentoDeLaCotizacion).toHaveBeenCalledWith(261, 'ev-481');
    expect(repo.crear).toHaveBeenCalledWith({
      numero: '32000066941',
      fecha: '2026-10-14',
      rut: '65175239-6',
      razon_social: 'Corporación Instituto Profesional Santo Tomás',
      descripcion: 'Fiesta de Navidad Santo Tomás 2026, adultos 78 y niños 23',
      total: 2619929,
      documento_id: 261,
      company_id: 1,
      quotation_id: 'ev-481',
      origen: 'manual',
      creado_por: 'felipe',
    });
  });

  it('lo que BelIA leyó del comprador viaja con la OC, limpio (paso 2c)', async () => {
    const { repo, service } = armar();
    await service.crear(
      'ev-481',
      1,
      plainToInstance(CrearOrdenDeCompraDto, {
        ...OC3,
        origen: 'pdf',
        comprador: {
          giro: '  853201-ENSEÑANZA SUPERIOR  ',
          direccion: 'Av. Vicuña Mackenna 4835',
          comuna: 'San Joaquín',
          ciudad: '',
        },
      }),
      'felipe',
    );
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        origen: 'pdf',
        comprador: {
          giro: '853201-ENSEÑANZA SUPERIOR',
          direccion: 'Av. Vicuña Mackenna 4835',
          comuna: 'San Joaquín',
          ciudad: null,
        },
      }),
    );
    expect(
      await errores(CrearOrdenDeCompraDto, {
        ...OC3,
        comprador: { comuna: 'x'.repeat(41), otra: 1 },
      }),
    ).toEqual(['comprador']);
  });

  it('el evento de otra empresa no existe para esta', async () => {
    const { repo, service } = armar({ deLaEmpresa: false });
    await expect(service.deCotizacion('ajeno', 1)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.crear('ajeno', 1, dto(), null)).rejects.toThrow(
      NotFoundException,
    );
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('el PDF tiene que ser de los documentos del mismo evento', async () => {
    const { repo, service } = armar({ documentoDelEvento: false });
    await expect(service.crear('ev-481', 1, dto(), null)).rejects.toThrow(
      new BadRequestException(
        'Ese PDF no está en los documentos de este evento',
      ),
    );
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it('una fecha que no existe no se guarda', async () => {
    const { service } = armar();
    await expect(
      service.crear(
        'ev-481',
        1,
        plainToInstance(CrearOrdenDeCompraDto, { ...OC3, fecha: '2026-02-30' }),
        null,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('la misma OC dos veces en el evento se dice con palabras', async () => {
    const { repo, service } = armar();
    repo.crear.mockRejectedValue({ code: '23505' });
    await expect(service.crear('ev-481', 1, dto(), null)).rejects.toThrow(
      new ConflictException('Esa OC ya está cargada en este evento'),
    );
  });

  it('una OC que ya tiene facturas no se quita (los documentos tributarios no se borran)', async () => {
    const { repo, service } = armar();
    repo.borrar.mockRejectedValue({ code: '23503' });
    await expect(service.borrar('ev-481', 1, 3)).rejects.toThrow(
      new ConflictException(
        'Esa OC ya tiene documentos tributarios: no se puede quitar',
      ),
    );
  });

  it('editar o quitar una que no es de este evento: no existe', async () => {
    const { repo, service } = armar();
    repo.editar.mockResolvedValue(null);
    repo.borrar.mockResolvedValue(0);
    await expect(service.editar('ev-481', 1, 99, { total: 1 })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.borrar('ev-481', 1, 99)).rejects.toThrow(
      NotFoundException,
    );
  });
});
