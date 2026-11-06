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
    return {
      repo,
      service: new OrdenesDeCompraService(repo as never, {} as never),
    };
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

describe('Las OC salen de Documentos (doc 19 §9.20)', () => {
  const LEIDA = {
    numero: '32000066941',
    fecha: '2026-10-14',
    rut: '65175239-6',
    razon_social: 'Corporación Instituto Profesional Santo Tomás',
    descripcion: 'Fiesta de Navidad Santo Tomás 2026',
    neto: 2201621,
    iva: 418308,
    total: 2619929,
    giro: 'EDUCACION',
    direccion: null,
    comuna: 'San Joaquín',
    ciudad: null,
    otras_referencias: [],
  };
  const armar = ({
    pdfs = [{ id: 261, file_name: 'OC Santo Tomás' }],
    antes = [] as Record<string, unknown>[],
    leida = LEIDA as Record<string, unknown>,
    falla = null as Error | null,
  } = {}) => {
    const guardadas: Record<string, unknown>[] = [...antes];
    const repo = {
      cotizacionDeLaEmpresa: jest.fn().mockResolvedValue(true),
      documentoDeLaCotizacion: jest.fn().mockResolvedValue(true),
      ordenesEnDocumentos: jest.fn().mockResolvedValue(pdfs),
      deCotizacion: jest
        .fn()
        .mockImplementation(() => Promise.resolve([...guardadas])),
      crear: jest.fn().mockImplementation((fila: object) => {
        const oc = { id: 90 + guardadas.length, ...fila };
        guardadas.push(oc);
        return Promise.resolve(oc);
      }),
      borrar: jest.fn().mockResolvedValue(1),
    };
    const lector = {
      leer: jest
        .fn()
        .mockImplementation((_q: string, _c: number, id: number) =>
          falla
            ? Promise.reject(falla)
            : Promise.resolve({
                propuesta: leida,
                avisos: [],
                documento_id: id,
              }),
        ),
    };
    return {
      repo,
      lector,
      service: new OrdenesDeCompraService(repo as never, lector as never),
    };
  };

  it('el PDF que todavía no es una OC lo lee BelIA y queda guardado, tal como lo leyó', async () => {
    const { service, repo, lector } = armar();
    const r = await service.deDocumentos('ev-481', 1, 'felipe');
    expect(lector.leer).toHaveBeenCalledWith('ev-481', 1, 261);
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        numero: '32000066941',
        fecha: '2026-10-14',
        rut: '65175239-6',
        total: 2619929,
        neto: 2201621,
        documento_id: 261,
        origen: 'pdf',
        comprador: {
          giro: 'EDUCACION',
          direccion: null,
          comuna: 'San Joaquín',
          ciudad: null,
        },
        creado_por: 'felipe',
      }),
    );
    expect(r.ordenes).toHaveLength(1);
    expect(r.sinLeer).toEqual([]);
  });

  it('lo ya leído no se vuelve a leer', async () => {
    const { service, lector } = armar({
      antes: [{ id: 5, origen: 'pdf', documento_id: 261 }],
    });
    const r = await service.deDocumentos('ev-481', 1, 'felipe');
    expect(lector.leer).not.toHaveBeenCalled();
    expect(r.ordenes).toEqual([{ id: 5, origen: 'pdf', documento_id: 261 }]);
  });

  it('la OC leída cuyo PDF se quitó de Documentos se va con él; la escrita a mano se queda', async () => {
    const { service, repo } = armar({
      pdfs: [],
      antes: [
        { id: 5, origen: 'pdf', documento_id: null },
        { id: 6, origen: 'manual', documento_id: null },
      ],
    });
    repo.deCotizacion
      .mockResolvedValueOnce([
        { id: 5, origen: 'pdf', documento_id: null },
        { id: 6, origen: 'manual', documento_id: null },
      ])
      .mockResolvedValueOnce([{ id: 6, origen: 'manual', documento_id: null }]);
    const r = await service.deDocumentos('ev-481', 1, 'felipe');
    expect(repo.borrar).toHaveBeenCalledTimes(1);
    expect(repo.borrar).toHaveBeenCalledWith(5, 'ev-481', 1);
    expect(r.ordenes).toEqual([
      { id: 6, origen: 'manual', documento_id: null },
    ]);
  });

  it('lo que BelIA no pudo leer se dice, sin guardar nada', async () => {
    const sinFecha = armar({ leida: { ...LEIDA, fecha: null } });
    expect(
      (await sinFecha.service.deDocumentos('ev-481', 1, 'felipe')).sinLeer,
    ).toEqual([
      {
        documento_id: 261,
        nombre: 'OC Santo Tomás',
        motivo: 'BelIA no encontró la fecha',
      },
    ]);
    expect(sinFecha.repo.crear).not.toHaveBeenCalled();

    const caida = armar({
      falla: new BadRequestException('BelIA no pudo leer la orden de compra'),
    });
    expect(
      (await caida.service.deDocumentos('ev-481', 1, 'felipe')).sinLeer,
    ).toMatchObject([{ motivo: 'BelIA no pudo leer la orden de compra' }]);
  });

  it('un RUT mal leído no se guarda: la factura elige la razón social', async () => {
    const { service, repo } = armar({
      leida: { ...LEIDA, rut: '65175239-5' },
    });
    await service.deDocumentos('ev-481', 1, 'felipe');
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({ rut: null }),
    );
  });
});
