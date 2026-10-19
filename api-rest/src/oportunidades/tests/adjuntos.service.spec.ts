import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import {
  AdjuntosService,
  extensionDe,
  MAX_BYTES_ADJUNTO,
  nombreLimpio,
} from '../adjuntos/adjuntos.service';

/** El id de la sesión (la cuenta) y el del perfil son DISTINTOS. */
const CUENTA = 'b3c1e0f2-0000-4000-8000-000000000000';
const PERFIL = '9d0e7a51-0000-4000-8000-000000000000';

function armar() {
  const repo = {
    esDeLaEmpresa: jest.fn().mockResolvedValue(true),
    perfilDe: jest.fn().mockResolvedValue(PERFIL),
    listar: jest.fn().mockResolvedValue([]),
    subirArchivo: jest.fn().mockResolvedValue(undefined),
    guardar: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 7, ...fila }),
    ),
    borrarFila: jest.fn().mockResolvedValue({ ruta: 'c1/oportunidades/9/x' }),
    borrarArchivo: jest.fn().mockResolvedValue(true),
  };
  const logger = mockPinoLogger();
  const servicio = new AdjuntosService(
    repo as unknown as AdjuntosRepository,
    logger as unknown as PinoLogger,
  );
  return { repo, servicio, logger };
}

const archivo = (
  originalname: string,
  size = 1200,
  mimetype = 'application/octet-stream',
) =>
  ({
    originalname,
    size,
    mimetype,
    buffer: Buffer.alloc(Math.min(size, 16)),
  }) as Express.Multer.File;

/** Lo que se mandó al balde: [ruta, contenido, tipo]. */
const subidas = (repo: ReturnType<typeof armar>['repo']) =>
  repo.subirArchivo.mock.calls as Array<[string, Buffer, string]>;

describe('AdjuntosService — subir', () => {
  it('guarda en el balde privado de la empresa, con la ruta armada en el motor', async () => {
    const { repo, servicio } = armar();
    const r = await servicio.subir(
      1,
      CUENTA,
      9,
      archivo('Bases Técnicas Día del Profesor.pdf'),
    );

    const [ruta, , tipo] = repo.subirArchivo.mock.calls[0] as [
      string,
      Buffer,
      string,
    ];
    expect(ruta).toMatch(
      /^c1\/oportunidades\/9\/[\w-]+_Bases_Tecnicas_Dia_del_Profesor\.pdf$/,
    );
    expect(tipo).toBe('application/pdf');
    expect(repo.guardar).toHaveBeenCalledWith({
      company_id: 1,
      oportunidad_id: 9,
      nombre: 'Bases Técnicas Día del Profesor.pdf',
      ruta,
      tipo: 'application/pdf',
      bytes: 1200,
      seccion: 'bases',
      subido_por: PERFIL,
    });
    expect(r).toMatchObject({
      id: 7,
      nombre: 'Bases Técnicas Día del Profesor.pdf',
    });
  });

  it('el tipo sale de la extensión, no de lo que diga el navegador', async () => {
    const { repo, servicio } = armar();
    await servicio.subir(1, CUENTA, 9, archivo('Formularios_Anexos.DOCX'));
    expect(subidas(repo)[0][2]).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('dos archivos del mismo nombre no chocan', async () => {
    const { repo, servicio } = armar();
    await servicio.subir(1, CUENTA, 9, archivo('bases.pdf'));
    await servicio.subir(1, CUENTA, 9, archivo('bases.pdf'));
    const [[a], [b]] = repo.subirArchivo.mock.calls as Array<[string]>;
    expect(a).not.toBe(b);
  });

  it('rechaza lo que no es un documento (HTML, ejecutables, sin extensión)', async () => {
    const { repo, servicio } = armar();
    for (const nombre of [
      'pagina.html',
      'dibujo.svg',
      'instalar.exe',
      'bases',
    ]) {
      await expect(
        servicio.subir(1, CUENTA, 9, archivo(nombre)),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(repo.subirArchivo).not.toHaveBeenCalled();
  });

  it('rechaza el vacío, el de más de 30 MB y el pedido sin archivo', async () => {
    const { repo, servicio } = armar();
    await expect(
      servicio.subir(1, CUENTA, 9, archivo('a.pdf', 0)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      servicio.subir(1, CUENTA, 9, archivo('a.pdf', MAX_BYTES_ADJUNTO + 1)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      servicio.subir(1, CUENTA, 9, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.subirArchivo).not.toHaveBeenCalled();
  });

  it('una oportunidad de otra empresa es 404 y no sube nada', async () => {
    const { repo, servicio } = armar();
    repo.esDeLaEmpresa.mockResolvedValue(false);
    await expect(
      servicio.subir(2, CUENTA, 9, archivo('bases.pdf')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.esDeLaEmpresa).toHaveBeenCalledWith(2, 9);
    expect(repo.subirArchivo).not.toHaveBeenCalled();
  });

  it('si no se pudo anotar, el archivo se borra del balde (nada huérfano)', async () => {
    const { repo, servicio } = armar();
    repo.guardar.mockRejectedValue(new Error('se cayó la base'));
    await expect(
      servicio.subir(1, CUENTA, 9, archivo('bases.pdf')),
    ).rejects.toThrow('se cayó la base');
    expect(repo.borrarArchivo).toHaveBeenCalledWith(subidas(repo)[0][0]);
  });
});

describe('AdjuntosService — mi postulación (migración 127)', () => {
  it('lo de la postulación va a su carpeta y queda con su sección', async () => {
    const { repo, servicio } = armar();
    await servicio.subir(
      1,
      CUENTA,
      9,
      archivo('Anexo 1 firmado.pdf'),
      'postulacion',
    );
    const [ruta] = subidas(repo)[0];
    expect(ruta).toMatch(
      /^c1\/oportunidades\/9\/postulacion\/[\w-]+_Anexo_1_firmado\.pdf$/,
    );
    expect(repo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ seccion: 'postulacion' }),
    );
  });

  it('la oferta de un competidor va a su carpeta, con su nombre; sin nombre no se sube (migración 153)', async () => {
    const { repo, servicio } = armar();
    await servicio.subir(
      1,
      CUENTA,
      9,
      archivo('Oferta técnica.pdf'),
      'competencia',
      '  Sol de   Quillón SpA ',
    );
    const [ruta] = subidas(repo)[0];
    expect(ruta).toMatch(
      /^c1\/oportunidades\/9\/competencia\/[\w-]+_Oferta_tecnica\.pdf$/,
    );
    expect(repo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        seccion: 'competencia',
        competidor: 'Sol de Quillón SpA',
      }),
    );
    await expect(
      servicio.subir(1, CUENTA, 9, archivo('Oferta.pdf'), 'competencia', ' '),
    ).rejects.toThrow(BadRequestException);
    expect(repo.subirArchivo).toHaveBeenCalledTimes(1);
  });

  it('listar sin decir la sección trae las bases', async () => {
    const { repo, servicio } = armar();
    await servicio.listar(1, 9);
    expect(repo.listar).toHaveBeenCalledWith(1, 9, 'bases');
    await servicio.listar(1, 9, 'postulacion');
    expect(repo.listar).toHaveBeenLastCalledWith(1, 9, 'postulacion');
  });
});

describe('AdjuntosService — quién lo subió', () => {
  it('se guarda el PERFIL de la empresa, no el id de la sesión (lab, 17-10: con la sesión daba 500)', async () => {
    const { repo, servicio } = armar();
    await servicio.subir(1, CUENTA, 9, archivo('bases.pdf'));
    expect(repo.perfilDe).toHaveBeenCalledWith(1, CUENTA);
    expect(repo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ subido_por: PERFIL }),
    );
  });

  it('sin perfil en la empresa, el archivo igual se guarda, sin firma', async () => {
    const { repo, servicio } = armar();
    repo.perfilDe.mockResolvedValue(null);
    await servicio.subir(1, CUENTA, 9, archivo('bases.pdf'));
    expect(repo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ subido_por: null }),
    );
  });
});

describe('AdjuntosService — listar y borrar', () => {
  it('listar comprueba que la oportunidad sea de la empresa', async () => {
    const { repo, servicio } = armar();
    repo.esDeLaEmpresa.mockResolvedValue(false);
    await expect(servicio.listar(2, 9)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.listar).not.toHaveBeenCalled();
  });

  it('borra la fila y después el archivo', async () => {
    const { repo, servicio } = armar();
    await expect(servicio.borrar(1, 9, 7)).resolves.toEqual({ borrado: true });
    expect(repo.borrarFila).toHaveBeenCalledWith(1, 9, 7);
    expect(repo.borrarArchivo).toHaveBeenCalledWith('c1/oportunidades/9/x');
  });

  it('un archivo que no es de la empresa es 404 y no toca el balde', async () => {
    const { repo, servicio } = armar();
    repo.borrarFila.mockResolvedValue(null);
    await expect(servicio.borrar(2, 9, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.borrarArchivo).not.toHaveBeenCalled();
  });

  it('si el balde falla, la fila igual queda borrada (y se anota)', async () => {
    const { repo, servicio, logger } = armar();
    repo.borrarArchivo.mockResolvedValue(false);
    await expect(servicio.borrar(1, 9, 7)).resolves.toEqual({ borrado: true });
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('el nombre del archivo', () => {
  it('sin carpetas ni espacios de más', () => {
    expect(nombreLimpio('C:\\Users\\x\\  Bases   Técnicas.pdf ')).toBe(
      'Bases Técnicas.pdf',
    );
  });

  it('si es muy largo se corta, pero conserva la extensión', () => {
    const largo = `${'a'.repeat(300)}.docx`;
    const corto = nombreLimpio(largo);
    expect(corto.length).toBeLessThanOrEqual(150);
    expect(corto.endsWith('.docx')).toBe(true);
  });

  it('la extensión, en minúsculas; sin punto no hay', () => {
    expect(extensionDe('Anexo.XLSX')).toBe('xlsx');
    expect(extensionDe('bases')).toBe('');
    expect(extensionDe('.oculto')).toBe('');
  });
});
