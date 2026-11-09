import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { OrdenesDeCompraService } from 'src/facturacion/ordenes-de-compra/ordenes-de-compra.service';
import type { StorageService } from 'src/storage/storage.service';
import type { CotizacionCandidata } from '../elegir-cotizacion';
import type { RobotOcRepository } from '../robot-oc.repository';
import { RobotOcService } from '../robot-oc.service';

const RUDEL: CotizacionCandidata = {
  id: '0d903bfc-c4f2-4bb3-af89-00a089297cc5',
  numero: 500,
  estado: 'aceptada',
  total: 40_840_800,
  fecha_evento: '2026-11-09T00:00:00+00:00',
  cliente_id: 'rudel',
  cliente: 'Rudel S.A.',
  correo_contacto: 'crozas@rudel.cl',
  correos_cliente: ['crozas@rudel.cl'],
  ruts_cliente: [],
  ocs_cargadas: [],
};
const OC = {
  numero: '35074',
  total: 4_522_000,
  correos: ['info.sibo@rudel.cl'],
  probar: false,
};
const PDF = {
  buffer: Buffer.from('%PDF-1.4 ...'),
  size: 12,
  mimetype: 'application/pdf',
  originalname: 'OC-35074.pdf',
} as Express.Multer.File;

const armar = (vars: Record<string, string | undefined>) => {
  const repo = {
    candidatas: jest.fn().mockResolvedValue([RUDEL]),
    agregarDocumento: jest.fn().mockResolvedValue(901),
  };
  const storage = {
    upload: jest
      .fn()
      .mockImplementation(
        (_dto: unknown, f: { originalname: string }, e: number) =>
          Promise.resolve({
            url: `c${e}/event-documents/${RUDEL.id}/ordenes_compra/ts_${f.originalname}`,
          }),
      ),
  };
  const ocs = { leerAlSubir: jest.fn().mockResolvedValue(undefined) };
  const config = { get: (k: string) => vars[k] } as unknown as ConfigService;
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
  } as unknown as PinoLogger;
  const s = new RobotOcService(
    repo as unknown as RobotOcRepository,
    storage as unknown as StorageService,
    config,
    logger,
    ocs as unknown as OrdenesDeCompraService,
  );
  return { s, repo, ocs, storage };
};
const ENCENDIDO = { ROBOT_OC_KEY: 'llave-de-prueba', ROBOT_OC_EMPRESA: '1' };

describe('La puerta del robot de OC', () => {
  it('sin llave configurada, la puerta está apagada', () => {
    const { s } = armar({});
    expect(() => s.revisarLlave('x')).toThrow(ServiceUnavailableException);
  });

  it('con otra llave, o sin ella, se cierra', () => {
    const { s } = armar(ENCENDIDO);
    expect(() => s.revisarLlave('otra')).toThrow(UnauthorizedException);
    expect(() => s.revisarLlave(undefined)).toThrow(UnauthorizedException);
  });

  it('con la llave, dice la empresa del robot', () => {
    expect(armar(ENCENDIDO).s.revisarLlave('llave-de-prueba')).toBe(1);
  });

  it('«probar» dice dónde iría y no sube nada', async () => {
    const { s, repo, ocs, storage } = armar(ENCENDIDO);
    const r = await s.recibir(1, { ...OC, probar: true });
    expect(r).toMatchObject({
      resultado: 'iria',
      nombre: 'OC 35074 · Rudel · $4.522.000',
      cotizacion: { numero: 500 },
    });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(repo.agregarDocumento).not.toHaveBeenCalled();
    expect(ocs.leerAlSubir).not.toHaveBeenCalled();
  });

  it('la sube a Documentos → Órdenes de compra y BelIA la lee', async () => {
    const { s, repo, ocs, storage } = armar(ENCENDIDO);
    const r = await s.recibir(1, OC, PDF);
    expect(r).toMatchObject({ resultado: 'subida', documento_id: 901 });
    expect(storage.upload).toHaveBeenCalledWith(
      {
        kind: 'event-document',
        quotation_id: RUDEL.id,
        category: 'ordenes_compra',
      },
      expect.objectContaining({ originalname: 'OC_35074.pdf' }),
      1,
    );
    const [{ url: ruta }] = await Promise.all(
      storage.upload.mock.results.map(
        (x) => x.value as Promise<{ url: string }>,
      ),
    );
    expect(ruta).toMatch(
      new RegExp(
        `^c1/event-documents/${RUDEL.id}/ordenes_compra/.+_OC_35074\\.pdf$`,
      ),
    );
    expect(repo.agregarDocumento).toHaveBeenCalledWith(
      RUDEL.id,
      'OC 35074 · Rudel · $4.522.000',
      ruta,
    );
    expect(ocs.leerAlSubir).toHaveBeenCalledWith(RUDEL.id, 1, null);
  });

  it('lo que no empieza como PDF no se sube', async () => {
    const { s, storage } = armar(ENCENDIDO);
    await expect(
      s.recibir(1, OC, { ...PDF, buffer: Buffer.from('<html>') }),
    ).rejects.toThrow('no es un PDF');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('con duda no sube nada y devuelve las candidatas', async () => {
    const { s, repo, storage } = armar(ENCENDIDO);
    repo.candidatas.mockResolvedValue([
      RUDEL,
      { ...RUDEL, id: 'otra', numero: 501, correo_contacto: null },
    ]);
    const r = await s.recibir(1, OC, PDF);
    expect(r).toMatchObject({ resultado: 'duda' });
    expect(storage.upload).not.toHaveBeenCalled();
  });
});
