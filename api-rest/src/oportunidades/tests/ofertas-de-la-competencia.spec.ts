import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import { CompetenciaCronService } from '../competencia/competencia-cron.service';
import { OfertasDeLaCompetenciaService } from '../competencia/ofertas-de-la-competencia.service';
import {
  type Pedir,
  archivosDelAnexo,
  enlaceDelCuadro,
  enlaceDelResumen,
  leerPaginaDelAnexo,
  nombreDelArchivo,
  ofertasDeLaLicitacion,
  ofertasDelResumen,
} from '../competencia/ofertas-publicas';
import type { ResultadosRepository } from '../competencia/resultados.repository';
import type { ResultadosDePostuladasService } from '../competencia/resultados.service';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';
import {
  CABECERA,
  FICHA,
  RESUMEN,
  paginaDelAnexo,
} from './ofertas-publicas-de-prueba';

// TRAER LAS OFERTAS DE LA COMPETENCIA (decisión 96 del doc 17, 27-10).
// Felipe: "si yo no las cargué, que tú lo trajeras una vez que la gané o
// perdí". El «Resumen de ofertas» es público y cada archivo se baja uno
// por uno, sin clave.

const PAGINA_1 = paginaDelAnexo(
  [
    ['02', 'N° 120.910-03-2026 Celebración Daem Quillón 2026.pdf', '1120'],
    ['03', 'TODA LA DOCUMENTACION.rar', '5000'],
  ],
  ['2', '3'],
);
const PAGINA_2 = paginaDelAnexo(
  [['02', 'Certificado de vigencia.pdf', '200']],
  ['1', '3'],
  'pagina2',
);
const PAGINA_3 = paginaDelAnexo(
  [['02', 'Patente.jpg', '300']],
  ['1', '2'],
  'pagina3',
);

/** El nombre como lo entrega fetch: UTF-8 leído como latin1. */
const comoLlega = (nombre: string) =>
  `attachment; filename=${Buffer.from(nombre, 'utf8').toString('latin1')}`;

/** Mercado Público de mentira: las páginas por dirección; los botones
 *  devuelven el archivo y el paginador, la página pedida. */
function mercadoPublico() {
  const pedidos: string[] = [];
  const responder = (url: string, init?: RequestInit): Response => {
    const cuerpo =
      init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
    pedidos.push(
      `${init?.method ?? 'GET'} ${url.split('?')[0].split('/').pop()}`,
    );
    if (init?.method === 'POST') {
      const boton = [...cuerpo.keys()].find((k) => k.endsWith('$search.x'));
      if (boton) {
        const estado = cuerpo.get('__VIEWSTATE');
        const nombre =
          estado === '/wEPDwpagina2'
            ? 'Certificado_de_vigencia.pdf'
            : estado === '/wEPDwpagina3'
              ? 'Patente.jpg'
              : 'N°_120.910-03-2026_Celebración_Daem_Quillón_2026.pdf';
        return new Response(Buffer.from(`%PDF-${nombre}`), {
          headers: { 'content-disposition': comoLlega(nombre) },
        });
      }
      const pagina = cuerpo.get('__EVENTARGUMENT');
      return new Response(pagina === 'Page$2' ? PAGINA_2 : PAGINA_3);
    }
    if (url.includes('DetailsAcquisition')) return new Response(FICHA);
    if (url.includes('OpeningHeader')) return new Response(CABECERA);
    if (url.includes('SupplySummary')) return new Response(RESUMEN);
    if (url.includes('ViewBidAttachment')) return new Response(PAGINA_1);
    return new Response('', { status: 404 });
  };
  const pedir: Pedir = (url, init) => Promise.resolve(responder(url, init));
  return { pedir, pedidos };
}

describe('el cuadro de ofertas público (decisión 96)', () => {
  it('de la ficha al resumen, solo por enlaces de Mercado Público', () => {
    expect(enlaceDelCuadro(FICHA)).toBe(
      'https://www.mercadopublico.cl/Procurement/Modules/RFB/StepsProcessAward/OpeningFrame.aspx?enc=kX7J6JRS7L1df0gSqRuzVOrg%2f0%2fYd5cqq%2bZZm2C',
    );
    expect(enlaceDelCuadro('<html>sin apertura</html>')).toBeNull();
    expect(
      enlaceDelCuadro(
        '<input id="imgCuadroOferta" href="https://otro.cl/robar.aspx?enc=1" />',
      ),
    ).toBeNull();
    expect(enlaceDelResumen(CABECERA)).toBe(
      'https://www.mercadopublico.cl/Procurement/Modules/RFB/StepsProcessAward/SupplySummary.aspx?enc=YMeP54yyyMFSHpJzHIb0UDkCQh6bM6%2bAbC',
    );
  });

  it('cada oferente con su RUT, su total y sus anexos', () => {
    expect(ofertasDelResumen(RESUMEN)).toEqual([
      {
        rut: '77.701.305-K',
        proveedor: 'Centro de Eventos Valle del Sol',
        total: 13361345,
        estado: 'Aceptada',
        anexos: {
          administrativos: expect.stringContaining(
            'ViewBidAttachment.aspx?enc=Administrative02',
          ),
          tecnicos: expect.stringContaining('enc=Technical02'),
          economicos: expect.stringContaining('enc=Economic02'),
        },
      },
      {
        rut: '77.067.895-1',
        proveedor: 'Sol de Quillón',
        total: 13352941,
        estado: 'Aceptada',
        anexos: {
          administrativos: expect.stringContaining('enc=Administrative03'),
        },
      },
    ]);
  });

  it('la lista de un anexo: archivos con su tamaño, campos ocultos y páginas', () => {
    const p = leerPaginaDelAnexo(PAGINA_1);
    expect(p.archivos).toEqual([
      {
        nombre: 'N° 120.910-03-2026 Celebración Daem Quillón 2026.pdf',
        kb: 1120,
        boton: 'DWNL$grdId$ctl02$search',
      },
      {
        nombre: 'TODA LA DOCUMENTACION.rar',
        kb: 5000,
        boton: 'DWNL$grdId$ctl03$search',
      },
    ]);
    expect(p.ocultos.__VIEWSTATE).toBe('/wEPDwdDwtMTEw');
    expect(p.paginas).toEqual(['Page$2', 'Page$3']);
  });

  it('el nombre del archivo llega en UTF-8 leído como latin1', () => {
    expect(nombreDelArchivo(comoLlega('N°_120_Celebración.pdf'))).toBe(
      'N° 120 Celebración.pdf',
    );
    expect(nombreDelArchivo(null)).toBeNull();
  });

  it('baja uno por uno, página por página, y sin volver a la primera', async () => {
    const { pedir, pedidos } = mercadoPublico();
    const url = ofertasDelResumen(RESUMEN)[1].anexos.administrativos!;
    const bajados: string[] = [];
    for await (const a of archivosDelAnexo(
      url,
      (x) => !x.nombre.endsWith('.rar'),
      pedir,
    )) {
      bajados.push(a.nombre);
      expect(a.contenido.toString().startsWith('%PDF-')).toBe(true);
    }
    expect(bajados).toEqual([
      'N° 120.910-03-2026 Celebración Daem Quillón 2026.pdf',
      'Certificado de vigencia.pdf',
      'Patente.jpg',
    ]);
    // 1 lista + 3 archivos + 2 cambios de página: nada más.
    expect(pedidos).toHaveLength(6);
  });

  it('sin apertura todavía, no hay ofertas', async () => {
    const pedir: Pedir = () => Promise.resolve(new Response('<html></html>'));
    await expect(ofertasDeLaLicitacion('4364-13-LE26', pedir)).resolves.toEqual(
      [],
    );
    await expect(
      ofertasDeLaLicitacion('no es un código', pedir),
    ).resolves.toEqual([]);
  });
});

function armar() {
  const resultados = {
    licitacionesSinCompetencia: jest
      .fn()
      .mockResolvedValue([{ id: 84, codigo: '4364-13-LE26' }]),
  };
  const adjuntos = {
    subirArchivo: jest
      .fn<Promise<void>, [string, Buffer, string]>()
      .mockResolvedValue(undefined),
    guardar: jest.fn().mockResolvedValue({ id: 1 }),
    borrarArchivo: jest.fn().mockResolvedValue(true),
  };
  const oferente = {
    oferente: jest.fn().mockResolvedValue({ rut: '77701305-k' }),
  };
  const servicio = new OfertasDeLaCompetenciaService(
    resultados as unknown as ResultadosRepository,
    adjuntos as unknown as AdjuntosRepository,
    oferente as unknown as OferenteRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { resultados, adjuntos, servicio };
}

const enUnRato = () => Date.now() + 60_000;

describe('OfertasDeLaCompetenciaService — traer (decisión 96)', () => {
  it('trae los anexos de los demás oferentes, no los de la empresa ni los comprimidos', async () => {
    const { adjuntos, servicio } = armar();
    const { pedir, pedidos } = mercadoPublico();

    await expect(servicio.traer(1, enUnRato(), pedir)).resolves.toBe(3);

    // Solo el anexo de Sol de Quillón: el de Valle del Sol ni se abre.
    expect(
      pedidos.filter((p) => p === 'GET ViewBidAttachment.aspx'),
    ).toHaveLength(1);
    expect(adjuntos.guardar).toHaveBeenCalledTimes(3);
    expect(adjuntos.guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 1,
        oportunidad_id: 84,
        seccion: 'competencia',
        competidor: 'Sol de Quillón',
        nombre: 'N° 120.910-03-2026 Celebración Daem Quillón 2026.pdf',
        subido_por: null,
      }),
    );
    expect(adjuntos.subirArchivo.mock.calls[0][0]).toMatch(
      /^c1\/oportunidades\/84\/competencia\//,
    );
  });

  it('sin licitaciones por traer no le pregunta nada a Mercado Público', async () => {
    const { resultados, servicio } = armar();
    resultados.licitacionesSinCompetencia.mockResolvedValue([]);
    const pedir = jest.fn<ReturnType<Pedir>, Parameters<Pedir>>();
    await expect(servicio.traer(1, enUnRato(), pedir)).resolves.toBe(0);
    expect(pedir).not.toHaveBeenCalled();
  });

  it('si Mercado Público falla, sigue con la próxima y no se cae', async () => {
    const { resultados, adjuntos, servicio } = armar();
    resultados.licitacionesSinCompetencia.mockResolvedValue([
      { id: 84, codigo: '4364-13-LE26' },
      { id: 40, codigo: '1532886-5-LE26' },
    ]);
    const pedir: Pedir = () =>
      Promise.resolve(new Response('caído', { status: 503 }));
    await expect(servicio.traer(1, enUnRato(), pedir)).resolves.toBe(0);
    expect(adjuntos.guardar).not.toHaveBeenCalled();
  });

  it('si no se puede anotar el archivo, se borra del balde', async () => {
    const { adjuntos, servicio } = armar();
    adjuntos.guardar.mockRejectedValue(new Error('sin base'));
    await expect(
      servicio.traer(1, enUnRato(), mercadoPublico().pedir),
    ).resolves.toBe(0);
    expect(adjuntos.borrarArchivo).toHaveBeenCalledTimes(1);
  });
});

describe('el reloj de los resultados trae también las ofertas (decisión 96)', () => {
  it('después del resultado de cada empresa', async () => {
    const orden: string[] = [];
    const resultados = {
      revisar: jest.fn((id: number) => {
        orden.push(`resultado ${id}`);
        return Promise.resolve(0);
      }),
    };
    const ofertas = {
      traer: jest.fn((id: number) => {
        orden.push(`ofertas ${id}`);
        return Promise.resolve(0);
      }),
    };
    const reloj = new CompetenciaCronService(
      {
        empresasConModulo: jest.fn().mockResolvedValue([{ id: 1 }, { id: 7 }]),
      } as unknown as OportunidadesRepository,
      {} as never,
      {} as never,
      {} as never,
      mockPinoLogger() as unknown as PinoLogger,
      resultados as unknown as ResultadosDePostuladasService,
      ofertas as unknown as OfertasDeLaCompetenciaService,
    );
    await reloj.resultadosDeLasPostuladas();
    expect(orden).toEqual([
      'resultado 1',
      'ofertas 1',
      'resultado 7',
      'ofertas 7',
    ]);
  });
});
