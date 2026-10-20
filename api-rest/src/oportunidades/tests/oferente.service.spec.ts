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
import { FICHA_DE_LA_ORDEN, FICHA_VACIA } from './orden-de-compra-de-prueba';

const CUENTA = 'cuenta-1';

function armar() {
  const repo = {
    oferente: jest.fn().mockResolvedValue(null),
    guardar: jest.fn().mockResolvedValue(undefined),
    empresa: jest.fn().mockResolvedValue({
      name: 'Valle del Sol Quillón',
      sitio_web: ' www.valledelsolquillon.cl ',
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
      // La página web viene de Configuración (decisión 47).
      sitio_web: 'www.valledelsolquillon.cl',
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

  it('guarda el contacto del representante, el coordinador y la página web (migración 154)', async () => {
    const { repo, servicio } = armar();
    await servicio.guardar(1, {
      coordinador_nombre: ' Camila  Carvajal ',
      coordinador_correo: 'eventos@valledelsol.cl',
      representante_telefono: '+56 9 1234 5678',
      sitio_web: 'www.valledelsolquillon.cl',
    });
    expect(repo.guardar).toHaveBeenCalledWith(1, {
      coordinador_nombre: 'Camila Carvajal',
      coordinador_correo: 'eventos@valledelsol.cl',
      representante_telefono: '+56 9 1234 5678',
      sitio_web: 'www.valledelsolquillon.cl',
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

// LOS RESPALDOS DE EXPERIENCIA (decisión 34 del doc 17, 19-10): una orden de
// compra o una factura, con sus datos para el anexo de experiencia.
class OferenteDePrueba extends OferenteService {
  bajar = jest.fn<Promise<string>, [string]>();
  protected bajarLaOrden(codigo: string): Promise<string> {
    return this.bajar(codigo);
  }
}

function armarConLaOrden() {
  const { repo, archivos, logger } = armar();
  const servicio = new OferenteDePrueba(
    repo as unknown as OferenteRepository,
    archivos as unknown as AdjuntosRepository,
    logger as unknown as PinoLogger,
  );
  return { repo, archivos, servicio };
}

describe('OferenteService — los respaldos de experiencia', () => {
  it('se guardan con sus datos y sin vencimiento; sin número no se suben', async () => {
    const { repo, archivos, servicio } = armar();
    await expect(
      servicio.subirDocumento(1, CUENTA, archivo('OC.pdf'), {
        tipo: 'respaldo_experiencia',
        datos: JSON.stringify({ mandante: 'CCU' }),
      }),
    ).rejects.toThrow('Falta el número de la orden de compra o la factura.');
    expect(archivos.subirArchivo).not.toHaveBeenCalled();

    await servicio.subirDocumento(1, CUENTA, archivo('OC 4352-103-SE23.pdf'), {
      tipo: 'respaldo_experiencia',
      vence: '2027-01-01',
      datos: JSON.stringify({
        numero: '4352-103-SE23',
        mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        contrato: 'Cena del Día del Funcionario',
        anio: 2023,
        monto: 11_782_499,
        fuente: 'mercado_publico',
      }),
    });
    expect(repo.guardarDocumento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'respaldo_experiencia',
        vence: null,
        datos: {
          numero: '4352-103-SE23',
          mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
          contrato: 'Cena del Día del Funcionario',
          anio: 2023,
          monto: 11_782_499,
          fuente: 'mercado_publico',
        },
      }),
    );
  });

  it('con el número de la orden, trae los datos de la ficha pública; avisa si es de otro proveedor', async () => {
    const { repo, servicio } = armarConLaOrden();
    servicio.bajar.mockResolvedValue(FICHA_DE_LA_ORDEN);
    repo.oferente.mockResolvedValue({ rut: '77701305-K' });

    const propia = await servicio.ordenDeCompra(1, ' 4352-103-se23 ');
    expect(servicio.bajar).toHaveBeenCalledWith('4352-103-SE23');
    expect(propia.aviso).toBeNull();
    expect(propia.orden).toMatchObject({
      numero: '4352-103-SE23',
      mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      anio: 2023,
      monto: 11_782_499,
    });

    repo.oferente.mockResolvedValue({ rut: '76.123.456-7' });
    const ajena = await servicio.ordenDeCompra(1, '4352-103-SE23');
    expect(ajena.aviso).toBe(
      'Esta orden de compra es de otro proveedor (RUT 77.701.305-K).',
    );
  });

  it('un número que no es de orden, una orden que no existe o Mercado Público caído: dicho en palabras', async () => {
    const { servicio } = armarConLaOrden();
    await expect(servicio.ordenDeCompra(1, 'factura 120')).rejects.toThrow(
      BadRequestException,
    );
    expect(servicio.bajar).not.toHaveBeenCalled();

    servicio.bajar.mockResolvedValue(FICHA_VACIA);
    await expect(servicio.ordenDeCompra(1, '9999-1-SE23')).rejects.toThrow(
      NotFoundException,
    );

    servicio.bajar.mockRejectedValue(new Error('504'));
    await expect(servicio.ordenDeCompra(1, '9999-1-SE23')).rejects.toThrow(
      'Mercado Público no respondió. Inténtalo de nuevo en un rato.',
    );
  });
});

describe('OferenteService — «las 10 de siempre» (decisión 53)', () => {
  it('marca hasta 10; para marcar otra, primero se saca una', async () => {
    const { repo, servicio } = armar();
    const respaldos = jest.fn();
    const marcarDeSiempre = jest.fn().mockResolvedValue({ id: 39 });
    Object.assign(repo, { respaldos, marcarDeSiempre });
    respaldos.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => ({
        numero: String(i),
        siempre: true,
      })),
    );
    await servicio.marcarDeSiempre(1, 39, true);
    expect(marcarDeSiempre).toHaveBeenCalledWith(1, 39, true);

    respaldos.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        numero: String(i),
        siempre: true,
      })),
    );
    await expect(servicio.marcarDeSiempre(1, 40, true)).rejects.toThrow(
      'Ya hay 10 de siempre: saca una antes de marcar otra.',
    );
    // Desmarcar no mira el tope.
    await servicio.marcarDeSiempre(1, 39, false);
    expect(marcarDeSiempre).toHaveBeenLastCalledWith(1, 39, false);
  });

  it('si no es un respaldo de la empresa, 404', async () => {
    const { repo, servicio } = armar();
    Object.assign(repo, {
      respaldos: jest.fn().mockResolvedValue([]),
      marcarDeSiempre: jest.fn().mockResolvedValue(null),
    });
    await expect(servicio.marcarDeSiempre(1, 999, true)).rejects.toThrow(
      'No encontramos ese respaldo.',
    );
  });
});
