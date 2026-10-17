import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { OferenteRepository } from '../oferente/oferente.repository';
import {
  MAX_BYTES_DOCUMENTO,
  MAX_BYTES_FIRMA,
  OferenteService,
} from '../oferente/oferente.service';

const CUENTA = 'cuenta-1';

function armar() {
  const repo = {
    oferente: jest.fn().mockResolvedValue(null),
    guardar: jest.fn().mockResolvedValue(undefined),
    empresa: jest.fn().mockResolvedValue({
      name: 'Valle del Sol Quillón',
      bank_details: {
        rut: '77.701.305-K',
        banco: 'Banco de Chile',
        numero: '123',
        titular: 'VALLE DEL SOL QUILLON SPA',
        tipo_cuenta: 'corriente',
        correo_pagos: 'pagos@x.cl',
      },
    }),
    documentos: jest.fn().mockResolvedValue([]),
    guardarDocumento: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 3, ...fila }),
    ),
    borrarDocumento: jest
      .fn()
      .mockResolvedValue({ ruta: 'c1/oferente/documentos/x.pdf' }),
  };
  const archivos = {
    subirArchivo: jest.fn().mockResolvedValue(undefined),
    borrarArchivo: jest.fn().mockResolvedValue(true),
    perfilDe: jest.fn().mockResolvedValue('perfil-1'),
  };
  const logger = mockPinoLogger();
  const servicio = new OferenteService(
    repo as unknown as OferenteRepository,
    archivos as unknown as AdjuntosRepository,
    logger as unknown as PinoLogger,
  );
  return { repo, archivos, servicio, logger };
}

const archivo = (originalname: string, size = 1000) =>
  ({
    originalname,
    size,
    mimetype: 'application/octet-stream',
    buffer: Buffer.alloc(8),
  }) as Express.Multer.File;

describe('OferenteService — los datos', () => {
  it('sin datos todavía: todo vacío, más lo de Configuración de empresa (sin el correo de pagos)', async () => {
    const { servicio } = armar();
    const v = await servicio.ver(1);
    expect(v.oferente.razon_social).toBeNull();
    expect(v.oferente.firma_ruta).toBeNull();
    expect(v.empresa).toEqual({
      nombre: 'Valle del Sol Quillón',
      banco: {
        rut: '77.701.305-K',
        banco: 'Banco de Chile',
        tipo_cuenta: 'corriente',
        numero: '123',
        titular: 'VALLE DEL SOL QUILLON SPA',
      },
    });
  });

  it('guarda sin espacios de más; vacío = sin dato; solo lo que vino', async () => {
    const { repo, servicio } = armar();
    await servicio.guardar(1, {
      razon_social: '  VALLE DEL SOL   QUILLON SPA ',
      rut: '77.701.305-K',
      giro: '   ',
    });
    expect(repo.guardar).toHaveBeenCalledWith(1, {
      razon_social: 'VALLE DEL SOL QUILLON SPA',
      rut: '77.701.305-K',
      giro: null,
    });
  });

  it('un RUT sin forma de RUT es 400, y sin nada que guardar también', async () => {
    const { repo, servicio } = armar();
    await expect(
      servicio.guardar(1, { representante_rut: 'abc' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio.guardar(1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.guardar).not.toHaveBeenCalled();
    // Con o sin puntos sirve.
    await servicio.guardar(1, { rut: '77701305-k' });
    expect(repo.guardar).toHaveBeenCalled();
  });
});

describe('OferenteService — la firma', () => {
  it('va al balde privado de la empresa y reemplaza (y borra) la anterior', async () => {
    const { repo, archivos, servicio } = armar();
    repo.oferente.mockResolvedValue({
      firma_ruta: 'c1/oferente/firma_vieja.png',
    });
    await servicio.subirFirma(1, archivo('Firma Felipe.PNG'));
    const [ruta, , tipo] = archivos.subirArchivo.mock.calls[0] as [
      string,
      Buffer,
      string,
    ];
    expect(ruta).toMatch(/^c1\/oferente\/firma_[\w-]+\.png$/);
    expect(tipo).toBe('image/png');
    expect(repo.guardar).toHaveBeenCalledWith(1, {
      firma_ruta: ruta,
      firma_subida_en: expect.any(String) as unknown,
    });
    expect(archivos.borrarArchivo).toHaveBeenCalledWith(
      'c1/oferente/firma_vieja.png',
    );
  });

  it('solo imágenes y hasta 2 MB', async () => {
    const { archivos, servicio } = armar();
    await expect(
      servicio.subirFirma(1, archivo('firma.pdf')),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      servicio.subirFirma(1, archivo('firma.png', MAX_BYTES_FIRMA + 1)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio.subirFirma(1, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(archivos.subirArchivo).not.toHaveBeenCalled();
  });

  it('si no se pudo anotar, la imagen nueva se borra y la vieja se queda', async () => {
    const { repo, archivos, servicio } = armar();
    repo.oferente.mockResolvedValue({
      firma_ruta: 'c1/oferente/firma_vieja.png',
    });
    repo.guardar.mockRejectedValue(new Error('se cayó la base'));
    await expect(servicio.subirFirma(1, archivo('firma.png'))).rejects.toThrow(
      'se cayó la base',
    );
    const [[nueva]] = archivos.subirArchivo.mock.calls as Array<[string]>;
    expect(archivos.borrarArchivo).toHaveBeenCalledWith(nueva);
    expect(archivos.borrarArchivo).not.toHaveBeenCalledWith(
      'c1/oferente/firma_vieja.png',
    );
  });

  it('borrar la firma: sin firma es 404', async () => {
    const { repo, archivos, servicio } = armar();
    await expect(servicio.borrarFirma(1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    repo.oferente.mockResolvedValue({ firma_ruta: 'c1/oferente/firma.png' });
    await servicio.borrarFirma(1);
    expect(repo.guardar).toHaveBeenCalledWith(1, {
      firma_ruta: null,
      firma_subida_en: null,
    });
    expect(archivos.borrarArchivo).toHaveBeenCalledWith(
      'c1/oferente/firma.png',
    );
  });
});

describe('OferenteService — la carpeta de documentos', () => {
  it('guarda el documento con su tipo, su vencimiento y quién lo subió (el perfil)', async () => {
    const { repo, archivos, servicio } = armar();
    await servicio.subirDocumento(
      1,
      CUENTA,
      archivo('Patente Municipal 2026.pdf'),
      {
        tipo: 'patente',
        vence: '2026-12-31',
      },
    );
    const [ruta] = archivos.subirArchivo.mock.calls[0] as [string];
    expect(ruta).toMatch(
      /^c1\/oferente\/documentos\/[\w-]+_Patente_Municipal_2026\.pdf$/,
    );
    expect(repo.guardarDocumento).toHaveBeenCalledWith({
      company_id: 1,
      tipo: 'patente',
      nombre: 'Patente Municipal 2026.pdf',
      ruta,
      tipo_archivo: 'application/pdf',
      bytes: 1000,
      vence: '2026-12-31',
      subido_por: 'perfil-1',
    });
  });

  it('sin vencimiento queda en null; fuera ZIP, vacío y más de 15 MB', async () => {
    const { repo, archivos, servicio } = armar();
    await servicio.subirDocumento(1, CUENTA, archivo('F30.pdf'), {
      tipo: 'f30',
      vence: '',
    });
    expect(repo.guardarDocumento).toHaveBeenCalledWith(
      expect.objectContaining({ vence: null }),
    );
    archivos.subirArchivo.mockClear();
    for (const malo of [
      archivo('todo.zip'),
      archivo('vacio.pdf', 0),
      archivo('grande.pdf', MAX_BYTES_DOCUMENTO + 1),
    ]) {
      await expect(
        servicio.subirDocumento(1, CUENTA, malo, { tipo: 'otro' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(archivos.subirArchivo).not.toHaveBeenCalled();
  });

  it('borrar: la fila y el archivo; otro de otra empresa es 404', async () => {
    const { repo, archivos, servicio } = armar();
    await expect(servicio.borrarDocumento(1, 3)).resolves.toEqual({
      borrado: true,
    });
    expect(archivos.borrarArchivo).toHaveBeenCalledWith(
      'c1/oferente/documentos/x.pdf',
    );
    repo.borrarDocumento.mockResolvedValue(null);
    await expect(servicio.borrarDocumento(2, 3)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
