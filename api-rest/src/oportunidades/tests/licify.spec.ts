import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import {
  archivosDeLaRespuesta,
  claveDelNombre,
  LicifyService,
} from '../adjuntos/licify.service';
import type { OportunidadesRepository } from '../oportunidades.repository';

// «TRAER LOS DOCUMENTOS» POR LICIFY (decisión 65, 21-10). Felipe: "un botón
// de bajar documentos y que lo lleve directamente". Licify va de mentira:
// se espía `fetch`.

const CUENTA = 'b3c1e0f2-0000-4000-8000-000000000000';
const PERFIL = '9d0e7a51-0000-4000-8000-000000000000';
const ALMACEN =
  'https://pub-4a366d5d7d784a39b39efbf2079ff5a3.r2.dev/4364-13-LE26';

const fila = (nombre: string, extra: Record<string, unknown> = {}) => ({
  licitacion_id: '4364-13-LE26',
  file_original_url: `${ALMACEN}/${encodeURIComponent(nombre)}`,
  file_markdown_url: `https://pub-x.r2.dev/4364-13-LE26/${nombre}.md`,
  file_category: 'form_annex',
  file_size: 1000,
  ...extra,
});

/** Una respuesta de `fetch`: JSON para la lista, bytes para un archivo. */
const respuesta = (cuerpo: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: () => Promise.resolve(cuerpo),
  arrayBuffer: () =>
    Promise.resolve(
      Uint8Array.from(Buffer.from(typeof cuerpo === 'string' ? cuerpo : ''))
        .buffer,
    ),
});

function armar(
  ficha: unknown = { codigo: '4364-13-LE26', proceso: { tipo: 'licitacion' } },
) {
  const repo = {
    listar: jest.fn().mockResolvedValue([]),
    perfilDe: jest.fn().mockResolvedValue(PERFIL),
    subirArchivo: jest.fn().mockResolvedValue(undefined),
    guardar: jest.fn((f: Record<string, unknown>) =>
      Promise.resolve({ id: 7, ...f }),
    ),
    borrarArchivo: jest.fn().mockResolvedValue(true),
  };
  const oportunidades = { ficha: jest.fn().mockResolvedValue(ficha) };
  const servicio = new LicifyService(
    repo as unknown as AdjuntosRepository,
    oportunidades as unknown as OportunidadesRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, oportunidades, servicio };
}

describe('LicifyService — traer los documentos', () => {
  let fetchFalso: jest.SpyInstance;
  const tokenDeAntes = process.env.APIFY_TOKEN;

  beforeEach(() => {
    process.env.APIFY_TOKEN = 'apify_api_de_prueba';
    fetchFalso = jest.spyOn(global, 'fetch');
  });
  afterEach(() => {
    fetchFalso.mockRestore();
    if (tokenDeAntes === undefined) delete process.env.APIFY_TOKEN;
    else process.env.APIFY_TOKEN = tokenDeAntes;
  });

  /** Lo que se pidió: [url, opciones]. */
  const pedidos = () => fetchFalso.mock.calls as Array<[string, RequestInit]>;

  it('sin el token del motor no pide nada: 400', async () => {
    delete process.env.APIFY_TOKEN;
    const { servicio } = armar();
    await expect(servicio.traer(1, CUENTA, 9)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('pide la lista a Licify con el token en la cabecera y guarda lo que baja en «Bases y anexos»', async () => {
    const { repo, servicio } = armar();
    fetchFalso
      .mockResolvedValueOnce(
        respuesta([
          fila('Formularios_Anexos.docx', { file_size: 27 }),
          fila('Bases técnicas.pdf', { file_size: 12 }),
        ]),
      )
      .mockResolvedValueOnce(respuesta('contenido del Word de 27 bytes'))
      .mockResolvedValueOnce(respuesta('%PDF bases'));

    const r = await servicio.traer(1, CUENTA, 9);

    const [url, opciones] = pedidos()[0];
    expect(url).toBe(
      'https://api.apify.com/v2/acts/licify~mercadopublico-licitaciones/run-sync-get-dataset-items?timeout=120&memory=1024',
    );
    expect(opciones.method).toBe('POST');
    expect((opciones.headers as Record<string, string>).authorization).toBe(
      'Bearer apify_api_de_prueba',
    );
    expect(JSON.parse(opciones.body as string)).toEqual({
      action: 'list-files',
      entityId: '4364-13-LE26',
      maxItems: 200,
    });
    // Los archivos se bajan del almacén de Licify, presentándonos como
    // Eventia.
    expect(pedidos()[1][0]).toBe(`${ALMACEN}/Formularios_Anexos.docx`);
    expect(
      (pedidos()[1][1].headers as Record<string, string>)['user-agent'],
    ).toContain('Eventia');

    expect(repo.subirArchivo).toHaveBeenCalledTimes(2);
    const [ruta, contenido, tipo] = repo.subirArchivo.mock.calls[0] as [
      string,
      Buffer,
      string,
    ];
    expect(ruta).toMatch(/^c1\/oportunidades\/9\/.+_Formularios_Anexos\.docx$/);
    expect(contenido.toString()).toBe('contenido del Word de 27 bytes');
    expect(tipo).toContain('wordprocessingml');
    expect(repo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 1,
        oportunidad_id: 9,
        nombre: 'Bases técnicas.pdf',
        tipo: 'application/pdf',
        seccion: 'bases',
        subido_por: PERFIL,
      }),
    );
    expect(r.disponibles).toBe(2);
    expect(r.bajados).toHaveLength(2);
    expect(r.omitidos).toEqual([]);
  });

  it('no repite lo que ya está: por el nombre aunque Licify lo escriba distinto, o por el mismo peso', async () => {
    const { repo, servicio } = armar();
    repo.listar.mockResolvedValue([
      { nombre: 'D.A. 3127 Aprueba llamado a licitación.pdf', bytes: 10 },
      { nombre: 'otro.pdf', bytes: 500 },
    ]);
    fetchFalso.mockResolvedValueOnce(
      respuesta([
        fila('D_A__3127_Aprueba_llamado_a_licitacion.pdf', { file_size: 999 }),
        fila('Ficha_Tecnica.pdf', { file_size: 500 }),
      ]),
    );
    const r = await servicio.traer(1, CUENTA, 9);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(repo.subirArchivo).not.toHaveBeenCalled();
    expect(r).toEqual({
      disponibles: 2,
      bajados: [],
      omitidos: [
        {
          nombre: 'D_A__3127_Aprueba_llamado_a_licitacion.pdf',
          motivo: 'ya estaba',
        },
        { nombre: 'Ficha_Tecnica.pdf', motivo: 'ya estaba' },
      ],
    });
  });

  it('lo que no se puede bajar o no se sube se anota, y el resto sigue', async () => {
    const { repo, servicio } = armar();
    fetchFalso
      .mockResolvedValueOnce(
        respuesta([
          fila('pagina.html'),
          fila('Decreto.pdf'),
          fila('Formularios.docx'),
        ]),
      )
      .mockResolvedValueOnce(respuesta('', 403))
      .mockResolvedValueOnce(respuesta('word'));
    const r = await servicio.traer(1, CUENTA, 9);
    expect(r.omitidos).toEqual([
      { nombre: 'pagina.html', motivo: 'tipo de archivo que no se sube' },
      { nombre: 'Decreto.pdf', motivo: 'no se pudo bajar' },
    ]);
    expect(r.bajados.map((b) => b.nombre)).toEqual(['Formularios.docx']);
    expect(repo.subirArchivo).toHaveBeenCalledTimes(1);
  });

  it('Licify caído: 503 y nada se toca; sin la ficha, 404 antes de pedir', async () => {
    const { repo, servicio } = armar();
    fetchFalso.mockResolvedValueOnce(respuesta({ error: 'x' }, 500));
    await expect(servicio.traer(1, CUENTA, 9)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(repo.subirArchivo).not.toHaveBeenCalled();
    const sinFicha = armar(null);
    await expect(sinFicha.servicio.traer(1, CUENTA, 9)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('una compra ágil se le pide al otro servicio de Licify', async () => {
    const { servicio } = armar({
      codigo: '1375757-163-COT26',
      proceso: { tipo: 'compra_agil' },
    });
    fetchFalso.mockResolvedValueOnce(respuesta([]));
    const r = await servicio.traer(1, CUENTA, 9);
    expect(pedidos()[0][0]).toContain('licify~mercadopublico-compraagil');
    expect(
      (JSON.parse(pedidos()[0][1].body as string) as { entityId: string })
        .entityId,
    ).toBe('1375757-163-COT26');
    expect(r).toEqual({ disponibles: 0, bajados: [], omitidos: [] });
  });

  it('si la fila no se guarda, el archivo se borra del balde', async () => {
    const { repo, servicio } = armar();
    fetchFalso
      .mockResolvedValueOnce(respuesta([fila('Bases.pdf')]))
      .mockResolvedValueOnce(respuesta('%PDF'));
    repo.guardar.mockRejectedValue(new Error('la base no respondió'));
    await expect(servicio.traer(1, CUENTA, 9)).rejects.toThrow(
      'la base no respondió',
    );
    expect(repo.borrarArchivo).toHaveBeenCalledWith(
      (repo.subirArchivo.mock.calls[0] as [string])[0],
    );
  });
});

describe('Lo que contesta Licify', () => {
  it('se queda con el archivo original y su nombre, decodificado; lo raro se bota', () => {
    expect(
      archivosDeLaRespuesta([
        fila('Bases técnicas.pdf', { file_size: 12 }),
        { file_original_url: 'http://inseguro/x.pdf' },
        { file_original_url: 'https://pub-x.r2.dev/4364/' },
        'basura',
      ]),
    ).toEqual([
      {
        nombre: 'Bases técnicas.pdf',
        url: `${ALMACEN}/Bases%20t%C3%A9cnicas.pdf`,
        categoria: 'form_annex',
        bytes: 12,
      },
    ]);
    expect(archivosDeLaRespuesta({ error: 'x' })).toEqual([]);
  });

  it('en una compra ágil toma la copia de Licify (file_r2_url) con su nombre, y lo que solo está en Mercado Público no se intenta', () => {
    expect(
      archivosDeLaRespuesta([
        {
          file_name: 'Celebración día del funcionario.pdf',
          file_original_url:
            'https://servicios-compra-agil.mercadopublico.cl/v1/compra-agil/comprador/descargar?id=E7C6',
          file_r2_url:
            'https://pub-b779bb030f2e41d89e4a22bf5aaa8025.r2.dev/4121-27-COT26/E7C6.pdf',
          file_size: 500,
        },
        {
          file_name: 'Solo en Mercado Público.pdf',
          file_original_url:
            'https://servicios-compra-agil.mercadopublico.cl/v1/compra-agil/comprador/descargar?id=9C52',
        },
      ]),
    ).toEqual([
      {
        nombre: 'Celebración día del funcionario.pdf',
        url: 'https://pub-b779bb030f2e41d89e4a22bf5aaa8025.r2.dev/4121-27-COT26/E7C6.pdf',
        categoria: null,
        bytes: 500,
      },
    ]);
  });

  it('la clave del nombre iguala lo que el comprador escribió con lo que Licify guardó', () => {
    expect(claveDelNombre('D.A. 3127 Aprueba llamado a licitación.pdf')).toBe(
      claveDelNombre('D_A__3127_Aprueba_llamado_a_licitacion.pdf'),
    );
    expect(claveDelNombre('Ficha Técnica N°118.pdf')).not.toBe(
      claveDelNombre('Ficha Técnica N°115.pdf'),
    );
  });
});
