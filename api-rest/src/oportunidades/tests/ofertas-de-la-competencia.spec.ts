import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
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
import { ResultadosRepository } from '../competencia/resultados.repository';
import type { ResultadosDePostuladasService } from '../competencia/resultados.service';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';
import {
  CABECERA,
  FICHA,
  RESUMEN,
  fila,
  paginaDelAnexo,
} from './ofertas-publicas-de-prueba';

// TRAER LAS OFERTAS DE LA COMPETENCIA (decisión 96 del doc 17, 27-10).
// Felipe: "si yo no las cargué, que tú lo trajeras una vez que la gané o
// perdí". El «Resumen de ofertas» es público y cada archivo se baja uno
// por uno, sin clave. Desde la decisión 123 (10-11) también a pedido, con
// «Traer las ofertas», sin esperar el resultado: "con un botón acá en
// eventia".

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
    procesoDe: jest.fn().mockResolvedValue({
      id: 84,
      codigo: '4364-13-LE26',
      tipo: 'licitacion',
    }),
  };
  const adjuntos = {
    listar: jest.fn().mockResolvedValue([]),
    subirArchivo: jest
      .fn<Promise<void>, [string, Buffer, string]>()
      .mockResolvedValue(undefined),
    guardar: jest.fn().mockResolvedValue({ id: 1 }),
    borrarArchivo: jest.fn().mockResolvedValue(true),
  };
  const oferente = {
    oferente: jest.fn().mockResolvedValue({ rut: '77701305-k' }),
  };
  const servicio = new SinEsperas(
    resultados as unknown as ResultadosRepository,
    adjuntos as unknown as AdjuntosRepository,
    oferente as unknown as OferenteRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { resultados, adjuntos, oferente, servicio };
}

/** «Traer y comparar» espera la vuelta en curso de a 2 segundos: aquí, de a
 *  una pasada del reloj, y avisa cada vez. */
class SinEsperas extends OfertasDeLaCompetenciaService {
  alEsperar: () => void = () => undefined;
  protected pausa(): Promise<void> {
    this.alEsperar();
    return new Promise((listo) => setImmediate(listo));
  }
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

/** Lo que ya está en «La competencia», como lo devuelve el repositorio. */
const yaEsta = (
  competidor: string,
  nombre: string,
  bytes: number,
  subidoPor: string | null = null,
) => ({ competidor, nombre, bytes, subido_por: subidoPor });

/** Espera a que termine la vuelta que sigue por detrás. */
const alTerminar = async (servicio: OfertasDeLaCompetenciaService, id = 84) => {
  while (servicio.estado(1, id).trayendo) {
    await new Promise((listo) => setImmediate(listo));
  }
};

const bajadas = (pedidos: string[]) =>
  pedidos.filter((p) => p === 'POST ViewBidAttachment.aspx').length;

describe('«Traer y comparar»: traer y esperar (decisión 125)', () => {
  it('espera a que termine y devuelve cómo terminó, con lo que no se trae por su nombre', async () => {
    const { adjuntos, servicio } = armar();
    const vuelta = await servicio.traerAhora(1, 84, mercadoPublico().pedir);
    expect(vuelta).toEqual({
      terminada_en: expect.any(String),
      error: null,
      resultado: expect.objectContaining({
        traidos: 3,
        sinTraer: [
          {
            oferente: 'Sol de Quillón',
            nombre: 'TODA LA DOCUMENTACION.rar',
            motivo: 'viene comprimido',
          },
        ],
      }),
    });
    expect(adjuntos.guardar).toHaveBeenCalledTimes(3);
    // Ya terminó: la pantalla lo ve igual que con «Traer las ofertas».
    expect(servicio.estado(1, 84)).toEqual({ trayendo: false, ultima: vuelta });
  });

  it('si no hay qué traer (no es de la empresa, es compra ágil o falta el RUT), null y sin preguntarle a Mercado Público', async () => {
    const { resultados, oferente, servicio } = armar();
    const pedir = jest.fn<ReturnType<Pedir>, Parameters<Pedir>>();
    resultados.procesoDe.mockResolvedValueOnce(null);
    await expect(servicio.traerAhora(1, 84, pedir)).resolves.toBeNull();
    resultados.procesoDe.mockResolvedValueOnce({
      id: 84,
      codigo: '1346350-37-COT26',
      tipo: 'compra_agil',
    });
    await expect(servicio.traerAhora(1, 84, pedir)).resolves.toBeNull();
    oferente.oferente.mockResolvedValueOnce({ rut: '' });
    await expect(servicio.traerAhora(1, 84, pedir)).resolves.toBeNull();
    expect(pedir).not.toHaveBeenCalled();
  });

  it('si Mercado Público está caído no lanza: devuelve el porqué', async () => {
    const { servicio } = armar();
    const caido: Pedir = () =>
      Promise.resolve(new Response('caído', { status: 503 }));
    await expect(servicio.traerAhora(1, 84, caido)).resolves.toEqual({
      terminada_en: expect.any(String),
      error: expect.stringContaining('Mercado Público respondió 503'),
      resultado: null,
    });
  });

  it('si ya se están trayendo, espera esa vuelta en vez de largar otra', async () => {
    const { adjuntos, servicio } = armar();
    const mp = mercadoPublico();
    let soltar: () => void = () => undefined;
    const espera = new Promise<void>((listo) => {
      soltar = listo;
    });
    const lento: Pedir = async (url, init) => {
      await espera;
      return mp.pedir(url, init);
    };
    await servicio.traerAPedido(1, 84, lento);
    // Mientras espera, la otra vuelta avanza.
    servicio.alEsperar = soltar;
    const vuelta = await servicio.traerAhora(1, 84, mp.pedir);
    expect(vuelta?.resultado?.traidos).toBe(3);
    expect(adjuntos.guardar).toHaveBeenCalledTimes(3);
    expect(servicio.estado(1, 84).trayendo).toBe(false);
  });
});

describe('«Traer las ofertas», a pedido (decisión 123)', () => {
  it('trae las de una licitación sin esperar el resultado: responde al tiro, sigue por detrás y deja dicho cómo terminó', async () => {
    const { resultados, adjuntos, servicio } = armar();
    const { pedir } = mercadoPublico();

    await expect(servicio.traerAPedido(1, 84, pedir)).resolves.toEqual({
      trayendo: true,
      ultima: null,
    });
    await alTerminar(servicio);

    expect(resultados.procesoDe).toHaveBeenCalledWith(1, 84);
    // No pasa por la lista del reloj (ganadas y perdidas sin competencia).
    expect(resultados.licitacionesSinCompetencia).not.toHaveBeenCalled();
    expect(adjuntos.guardar).toHaveBeenCalledTimes(3);
    expect(adjuntos.guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 1,
        oportunidad_id: 84,
        seccion: 'competencia',
        competidor: 'Sol de Quillón',
        subido_por: null,
      }),
    );
    expect(servicio.estado(1, 84)).toEqual({
      trayendo: false,
      ultima: {
        terminada_en: expect.any(String),
        error: null,
        resultado: {
          publicadas: true,
          oferentes: 1,
          traidos: 3,
          yaEstaban: 0,
          // El .rar: los comprimidos no se traen; queda por su nombre, para
          // que la comparación sepa que existe (decisión 125).
          noSeTraen: 1,
          sinTraer: [
            {
              oferente: 'Sol de Quillón',
              nombre: 'TODA LA DOCUMENTACION.rar',
              motivo: 'viene comprimido',
            },
          ],
          incompleto: false,
        },
      },
    });
    // De otra empresa o de otra licitación no dice nada.
    expect(servicio.estado(2, 84)).toEqual({ trayendo: false, ultima: null });
    expect(servicio.estado(1, 85)).toEqual({ trayendo: false, ultima: null });
  });

  it('no repite lo que ya está: lo del mismo oferente ni se baja, y lo que una persona subió a mano con otro nombre no se guarda dos veces', async () => {
    const { adjuntos, servicio } = armar();
    adjuntos.listar.mockResolvedValue([
      // De una vuelta anterior: mismo oferente, el peso que dice la lista.
      yaEsta(
        'Sol de Quillón',
        'N° 120.910-03-2026 Celebración Daem Quillón 2026.pdf',
        1120 * 1024 + 300,
      ),
      // Subido a mano, con el nombre que guardó el navegador y el oferente
      // escrito de otra forma: se reconoce por el peso exacto.
      yaEsta(
        'SOL DE QUILLON SPA',
        'Certificado_de_vigencia.pdf',
        Buffer.byteLength('%PDF-Certificado_de_vigencia.pdf'),
        'perfil-de-felipe',
      ),
    ]);
    const { pedir, pedidos } = mercadoPublico();

    await servicio.traerAPedido(1, 84, pedir);
    await alTerminar(servicio);

    expect(adjuntos.listar).toHaveBeenCalledWith(1, 84, 'competencia');
    expect(adjuntos.guardar).toHaveBeenCalledTimes(1);
    expect(adjuntos.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Patente.jpg' }),
    );
    // 2 cambios de página y 2 archivos: el primero ni se pidió.
    expect(bajadas(pedidos)).toBe(4);
    expect(servicio.estado(1, 84).ultima?.resultado).toEqual({
      publicadas: true,
      oferentes: 1,
      traidos: 1,
      yaEstaban: 2,
      noSeTraen: 1,
      sinTraer: [
        {
          oferente: 'Sol de Quillón',
          nombre: 'TODA LA DOCUMENTACION.rar',
          motivo: 'viene comprimido',
        },
      ],
      incompleto: false,
    });
  });

  it('el mismo nombre con otro peso es otro archivo: se trae', async () => {
    const { adjuntos, servicio } = armar();
    adjuntos.listar.mockResolvedValue([
      yaEsta('Sol de Quillón', 'Patente.jpg', 9_000_000),
    ]);
    await servicio.traerAPedido(1, 84, mercadoPublico().pedir);
    await alTerminar(servicio);
    expect(adjuntos.guardar).toHaveBeenCalledTimes(3);
    expect(servicio.estado(1, 84).ultima?.resultado?.yaEstaban).toBe(0);
  });

  it('una vuelta a la vez: el segundo clic mientras trae es 409 y el reloj no la toca; al terminar se puede pedir de nuevo', async () => {
    const { adjuntos, servicio } = armar();
    const mp = mercadoPublico();
    let soltar: () => void = () => undefined;
    const espera = new Promise<void>((listo) => {
      soltar = listo;
    });
    const lento: Pedir = async (url, init) => {
      await espera;
      return mp.pedir(url, init);
    };

    await servicio.traerAPedido(1, 84, lento);
    expect(servicio.estado(1, 84).trayendo).toBe(true);
    await expect(servicio.traerAPedido(1, 84, lento)).rejects.toBeInstanceOf(
      ConflictException,
    );
    // El reloj de los resultados (decisión 96) tampoco parte otra.
    await expect(servicio.traer(1, enUnRato(), mp.pedir)).resolves.toBe(0);
    expect(adjuntos.guardar).not.toHaveBeenCalled();

    soltar();
    await alTerminar(servicio);
    expect(adjuntos.guardar).toHaveBeenCalledTimes(3);
    await expect(servicio.traerAPedido(1, 84, mp.pedir)).resolves.toEqual({
      trayendo: true,
      ultima: null,
    });
    await alTerminar(servicio);
  });

  it('no es de la empresa: 404; una compra ágil o sin el RUT en «Mi empresa»: 400; y a Mercado Público no se le pregunta nada', async () => {
    const { resultados, oferente, servicio } = armar();
    const pedir = jest.fn<ReturnType<Pedir>, Parameters<Pedir>>();

    resultados.procesoDe.mockResolvedValueOnce(null);
    await expect(servicio.traerAPedido(1, 84, pedir)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    resultados.procesoDe.mockResolvedValueOnce({
      id: 84,
      codigo: '4364-900-COT26',
      tipo: 'compra_agil',
    });
    await expect(servicio.traerAPedido(1, 84, pedir)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Sin el RUT no se sabe cuál oferta es la de la empresa: quedaría
    // guardada como competencia.
    oferente.oferente.mockResolvedValueOnce({ rut: '  ' });
    await expect(servicio.traerAPedido(1, 84, pedir)).rejects.toThrow(
      /Falta el RUT de tu empresa/,
    );
    expect(pedir).not.toHaveBeenCalled();
    expect(servicio.estado(1, 84)).toEqual({ trayendo: false, ultima: null });
  });

  it('si Mercado Público todavía no muestra el cuadro, lo dice; y si solo ofertó la empresa, también', async () => {
    const { adjuntos, servicio } = armar();
    const sinApertura: Pedir = () =>
      Promise.resolve(new Response('<html></html>'));
    await servicio.traerAPedido(1, 84, sinApertura);
    await alTerminar(servicio);
    expect(servicio.estado(1, 84).ultima).toEqual({
      terminada_en: expect.any(String),
      error: null,
      resultado: {
        publicadas: false,
        oferentes: 0,
        traidos: 0,
        yaEstaban: 0,
        noSeTraen: 0,
        sinTraer: [],
        incompleto: false,
      },
    });

    const soloLaEmpresa = `<table id="grdSupplies">${fila('02', '77.701.305-K', 'Centro de Eventos Valle del Sol', '$ 13.361.345', ['Administrative'])}</table>`;
    const pedir: Pedir = (url) =>
      Promise.resolve(
        new Response(
          url.includes('DetailsAcquisition')
            ? FICHA
            : url.includes('OpeningHeader')
              ? CABECERA
              : soloLaEmpresa,
        ),
      );
    await servicio.traerAPedido(1, 84, pedir);
    await alTerminar(servicio);
    expect(servicio.estado(1, 84).ultima?.resultado).toEqual(
      expect.objectContaining({ publicadas: true, oferentes: 0, traidos: 0 }),
    );
    // Sin competencia no se mira ni lo que ya está.
    expect(adjuntos.listar).not.toHaveBeenCalled();
    expect(adjuntos.guardar).not.toHaveBeenCalled();
  });

  it('si Mercado Público está caído, deja dicho por qué y se puede volver a apretar', async () => {
    const { adjuntos, servicio } = armar();
    const caido: Pedir = () =>
      Promise.resolve(new Response('caído', { status: 503 }));
    await servicio.traerAPedido(1, 84, caido);
    await alTerminar(servicio);
    expect(servicio.estado(1, 84)).toEqual({
      trayendo: false,
      ultima: {
        terminada_en: expect.any(String),
        error: expect.stringMatching(
          /^No se pudieron traer las ofertas: Mercado Público respondió 503\./,
        ),
        resultado: null,
      },
    });
    expect(adjuntos.guardar).not.toHaveBeenCalled();
    // Al pedir de nuevo, el error de antes ya no se muestra.
    await servicio.traerAPedido(1, 84, mercadoPublico().pedir);
    await alTerminar(servicio);
    expect(servicio.estado(1, 84).ultima?.error).toBeNull();
    expect(adjuntos.guardar).toHaveBeenCalledTimes(3);
  });

  it('si un anexo falla a medias, se queda con lo que llegó y avisa que quedó algo sin traer', async () => {
    const { adjuntos, servicio } = armar();
    const mp = mercadoPublico();
    const seCorta: Pedir = (url, init) =>
      init?.body instanceof URLSearchParams &&
      init.body.get('__EVENTARGUMENT') === 'Page$2'
        ? Promise.reject(new Error('fetch failed'))
        : mp.pedir(url, init);
    await servicio.traerAPedido(1, 84, seCorta);
    await alTerminar(servicio);
    expect(adjuntos.guardar).toHaveBeenCalledTimes(1);
    expect(servicio.estado(1, 84).ultima).toEqual({
      terminada_en: expect.any(String),
      error: null,
      resultado: expect.objectContaining({ traidos: 1, incompleto: true }),
    });
  });

  it('si no se puede guardar, la vuelta se corta, el archivo se borra del balde y queda dicho', async () => {
    const { adjuntos, servicio } = armar();
    adjuntos.guardar.mockRejectedValue({ code: '57014', message: 'sin base' });
    const { pedir, pedidos } = mercadoPublico();
    await servicio.traerAPedido(1, 84, pedir);
    await alTerminar(servicio);
    expect(adjuntos.borrarArchivo).toHaveBeenCalledTimes(1);
    // Un solo archivo pedido: no siguió bajando los demás.
    expect(bajadas(pedidos)).toBe(1);
    expect(servicio.estado(1, 84).ultima?.error).toMatch(/sin base/);
  });

  it('el tope de la vuelta: lo que no alcanza queda para la próxima, y deja de hojear', async () => {
    const { adjuntos, servicio } = armar();
    const { pedir, pedidos } = mercadoPublico();
    let ahora = Date.now();
    const reloj = jest.spyOn(Date, 'now').mockImplementation(() => ahora);
    try {
      // Al guardar el primero pasan 16 minutos: la vuelta dura 15.
      adjuntos.guardar.mockImplementation(() => {
        ahora += 16 * 60_000;
        return Promise.resolve({ id: 1 });
      });
      await servicio.traerAPedido(1, 84, pedir);
      await alTerminar(servicio);
    } finally {
      reloj.mockRestore();
    }
    expect(adjuntos.guardar).toHaveBeenCalledTimes(1);
    // El archivo de la página 1 y el paso a la 2, donde se corta: la 3 ni
    // se abre.
    expect(bajadas(pedidos)).toBe(2);
    expect(servicio.estado(1, 84).ultima?.resultado).toEqual(
      expect.objectContaining({ traidos: 1, incompleto: true }),
    );
  });
});

describe('ResultadosRepository — la licitación a la que se le traen las ofertas (decisión 123)', () => {
  const armarRepo = (data: unknown) => {
    const pasos: unknown[][] = [];
    const cadena: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) {
      cadena[m] = (...args: unknown[]) => {
        pasos.push([m, ...args]);
        return cadena;
      };
    }
    cadena.maybeSingle = () => Promise.resolve({ data, error: null });
    const from = jest.fn(() => cadena);
    const repo = new ResultadosRepository({
      client: { from },
    } as unknown as SupabaseService);
    return { repo, from, pasos };
  };

  it('se busca por empresa e id, con el tipo de su proceso', async () => {
    const { repo, from, pasos } = armarRepo({
      id: 84,
      codigo: '5040-14-LE26',
      proceso: { tipo: 'licitacion' },
    });
    await expect(repo.procesoDe(1, 84)).resolves.toEqual({
      id: 84,
      codigo: '5040-14-LE26',
      tipo: 'licitacion',
    });
    expect(from).toHaveBeenCalledWith('oportunidades');
    expect(pasos.filter(([m]) => m === 'eq')).toEqual([
      ['eq', 'company_id', 1],
      ['eq', 'id', 84],
    ]);
  });

  it('si no es de la empresa, null', async () => {
    const { repo } = armarRepo(null);
    await expect(repo.procesoDe(2, 84)).resolves.toBeNull();
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
