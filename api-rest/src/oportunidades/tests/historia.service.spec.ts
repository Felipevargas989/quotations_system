import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { HistoriaRepository } from '../historia/historia.repository';
import { HistoriaService } from '../historia/historia.service';
import type { LecturaService } from '../lectura/lectura.service';
import {
  type MercadoPublicoClient,
  MercadoPublicoError,
} from '../mercado-publico/mercado-publico.client';
import type { OportunidadesRepository } from '../oportunidades.repository';
import { resumenVacio } from '../radar.service';
import { ACTA_DE_PRUEBA } from './acta-de-prueba';

const detalle = (codigo: string, extra: Record<string, unknown> = {}) => ({
  CodigoExterno: codigo,
  Nombre: `Proceso ${codigo}`,
  Comprador: { RegionUnidad: 'Región del Ñuble' },
  ...extra,
});

const NOCHE = new Date('2026-10-17T04:00:00Z').getTime(); // 01:00 en Chile
const DIA = new Date('2026-10-17T15:00:00Z').getTime(); // 12:00 en Chile

function armar() {
  const mp = {
    configurado: true,
    detalleLicitacion: jest.fn((codigo: string) =>
      Promise.resolve(detalle(codigo)),
    ),
    licitacionesDelDia: jest.fn().mockResolvedValue([]),
  };
  const repo = {
    procesosPorAdjudicar: jest.fn().mockResolvedValue([]),
    siguienteDiaDeHistoria: jest.fn().mockResolvedValue(null),
    marcarDiaDeHistoria: jest.fn().mockResolvedValue(undefined),
    procesosConocidos: jest.fn().mockResolvedValue(new Map()),
    guardarProcesos: jest.fn().mockResolvedValue(undefined),
  };
  const lectura = {
    configurado: true,
    candidatasPorNombre: jest.fn().mockResolvedValue(new Set<string>()),
  };
  const unidades = {
    regionesDeLasUnidades: jest.fn().mockResolvedValue(new Map()),
    procesosSeguidos: jest.fn().mockResolvedValue([]),
    guardarActa: jest.fn().mockResolvedValue(undefined),
  };
  const historia = new HistoriaService(
    mp as unknown as MercadoPublicoClient,
    repo as unknown as OportunidadesRepository,
    lectura as unknown as LecturaService,
    unidades as unknown as HistoriaRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  const guardados = () =>
    repo.guardarProcesos.mock.calls.flatMap(([lote]) =>
      (lote as Array<{ codigo: string }>).map((p) => p.codigo),
    );
  return { mp, repo, lectura, unidades, historia, guardados };
}

afterEach(() => jest.restoreAllMocks());

describe('HistoriaService — quién ganó', () => {
  it('revisa las cerradas de tus regiones y guarda las adjudicadas (y las que no, para revisarlas mañana)', async () => {
    const { mp, repo, historia, guardados } = armar();
    repo.procesosPorAdjudicar.mockResolvedValue([
      { codigo: 'ADJ', region: 'Región del Ñuble' },
      { codigo: 'SIN', region: 'Región del Biobío' },
      { codigo: 'LEJOS', region: 'Región de Magallanes' },
    ]);
    mp.detalleLicitacion.mockImplementation((codigo: string) =>
      Promise.resolve(
        detalle(
          codigo,
          codigo === 'ADJ'
            ? {
                Adjudicacion: { NumeroOferentes: 2 },
                Items: {
                  Listado: [
                    {
                      NombreProducto: 'Evento',
                      Adjudicacion: {
                        RutProveedor: '1-9',
                        NombreProveedor: 'GANADOR SPA',
                        Cantidad: 1,
                        MontoUnitario: 1000,
                      },
                    },
                  ],
                },
              }
            : {},
        ),
      ),
    );
    const resumen = resumenVacio();

    await historia.revisarAdjudicaciones(
      resumen,
      ['Ñuble', 'Biobío'],
      Date.now(),
    );

    expect(mp.detalleLicitacion.mock.calls.map(([c]) => c)).toEqual([
      'ADJ',
      'SIN',
    ]);
    expect(guardados()).toEqual(['ADJ', 'SIN']);
    expect(resumen.adjudicaciones).toEqual({
      estado: 'ok',
      revisadas: 2,
      adjudicadas: 1,
    });
  });

  it('sin cupo, para y guarda lo que alcanzó', async () => {
    const { mp, repo, historia, guardados } = armar();
    repo.procesosPorAdjudicar.mockResolvedValue([
      { codigo: 'A', region: 'Región del Ñuble' },
      { codigo: 'B', region: 'Región del Ñuble' },
    ]);
    mp.detalleLicitacion
      .mockResolvedValueOnce(detalle('A'))
      .mockRejectedValueOnce(new MercadoPublicoError('sin cupo', 429));
    const resumen = resumenVacio();

    await historia.revisarAdjudicaciones(resumen, ['Ñuble'], Date.now());

    expect(resumen.adjudicaciones.estado).toBe('cortada');
    expect(guardados()).toEqual(['A']);
  });
});

describe('HistoriaService — las seguidas (decisión 30, 19-10)', () => {
  const ACTA =
    'http://www.mercadopublico.cl/Procurement/Modules/RFB/StepsProcessAward/PreviewAwardAct.aspx?qs=abc123=';

  it('una licitación seguida se revisa aunque sea de otra región; con el acta publicada, se guarda con todas sus ofertas', async () => {
    const { mp, unidades, historia, guardados } = armar();
    unidades.procesosSeguidos.mockResolvedValue([{ codigo: 'GIRA' }]);
    mp.detalleLicitacion.mockResolvedValue(
      detalle('GIRA', {
        Comprador: { RegionUnidad: 'Región Metropolitana de Santiago' },
        Adjudicacion: { NumeroOferentes: 2, UrlActa: ACTA },
      }),
    );
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(ACTA_DE_PRUEBA));
    const resumen = resumenVacio();

    await historia.revisarAdjudicaciones(resumen, ['Ñuble'], Date.now());

    expect(guardados()).toEqual(['GIRA']);
    expect(fetch).toHaveBeenCalledWith(ACTA, expect.any(Object));
    const [codigo, acta] = unidades.guardarActa.mock.calls[0] as [
      string,
      { items: Array<{ ofertas: Array<{ proveedor: string }> }> },
    ];
    expect(codigo).toBe('GIRA');
    expect(acta.items[0].ofertas.map((o) => o.proveedor)).toEqual([
      'TURISMO DEL SUR LIMITADA',
      'VIAJES ANDINOS SPA',
    ]);
    expect(resumen.adjudicaciones.revisadas).toBe(1);
  });

  it('sin acta todavía, no se va a buscar nada; si el acta falla, la corrida sigue', async () => {
    const { mp, unidades, historia } = armar();
    unidades.procesosSeguidos.mockResolvedValue([
      { codigo: 'SIN' },
      { codigo: 'ROTA' },
    ]);
    mp.detalleLicitacion.mockImplementation((codigo: string) =>
      Promise.resolve(
        detalle(
          codigo,
          codigo === 'ROTA' ? { Adjudicacion: { UrlActa: ACTA } } : {},
        ),
      ),
    );
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('caída', { status: 503 }));
    const resumen = resumenVacio();

    await historia.revisarAdjudicaciones(resumen, ['Ñuble'], Date.now());

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(unidades.guardarActa).not.toHaveBeenCalled();
    expect(resumen.adjudicaciones.revisadas).toBe(2);
    expect(resumen.avisos).toEqual([]);
  });
});

describe('HistoriaService — la historia', () => {
  it('de día y a mano no toca: es de noche, o en el arranque del laboratorio', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(DIA);
    const { repo, historia } = armar();
    const resumen = resumenVacio();
    await historia.cargarHistoria(resumen, Date.now(), 'manual');
    await historia.cargarHistoria(resumen, Date.now(), 'reloj');
    expect(resumen.historia.estado).toBe('no_toca');
    expect(repo.siguienteDiaDeHistoria).not.toHaveBeenCalled();
  });

  it('un día: lista, filtro por nombre, detalle solo de las candidatas y el día queda hecho', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOCHE);
    const { mp, repo, lectura, historia, guardados } = armar();
    repo.siguienteDiaDeHistoria
      .mockResolvedValueOnce('2025-10-03')
      .mockResolvedValue(null);
    repo.procesosConocidos.mockResolvedValue(
      new Map([['YA', { fecha_cierre: null, estado: 'Adjudicada' }]]),
    );
    mp.licitacionesDelDia.mockResolvedValue([
      { CodigoExterno: 'PROFESOR', Nombre: 'Día del profesor' },
      { CodigoExterno: 'DENTAL', Nombre: 'Insumos dentales' },
      { CodigoExterno: 'YA', Nombre: 'Ya guardada' },
    ]);
    lectura.candidatasPorNombre.mockResolvedValue(new Set(['PROFESOR']));
    const resumen = resumenVacio();

    await historia.cargarHistoria(resumen, Date.now(), 'reloj');

    expect(mp.licitacionesDelDia).toHaveBeenCalledWith('03102025');
    expect(lectura.candidatasPorNombre).toHaveBeenCalledWith(
      [
        { codigo: 'PROFESOR', nombre: 'Día del profesor' },
        { codigo: 'DENTAL', nombre: 'Insumos dentales' },
      ],
      expect.any(Object),
    );
    expect(mp.detalleLicitacion).toHaveBeenCalledTimes(1);
    expect(guardados()).toEqual(['PROFESOR']);
    expect(repo.marcarDiaDeHistoria).toHaveBeenCalledWith('2025-10-03', {
      estado: 'hecha',
      listadas: 3,
      candidatas: 1,
      guardadas: 1,
      error: null,
    });
    expect(resumen.historia).toMatchObject({
      estado: 'completa',
      dias: 1,
      candidatas: 1,
      guardadas: 1,
    });
  });

  it('la corrida de arranque del laboratorio sí carga historia, de día', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(DIA);
    const { repo, historia } = armar();
    const resumen = resumenVacio();
    await historia.cargarHistoria(resumen, Date.now(), 'arranque');
    expect(repo.siguienteDiaDeHistoria).toHaveBeenCalled();
    expect(resumen.historia.estado).toBe('completa');
  });

  it('sin cupo a mitad de un día: se corta y el día queda pendiente', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOCHE);
    const { mp, repo, lectura, historia } = armar();
    repo.siguienteDiaDeHistoria.mockResolvedValue('2025-10-03');
    mp.licitacionesDelDia.mockResolvedValue([
      { CodigoExterno: 'A', Nombre: 'Cena aniversario' },
    ]);
    lectura.candidatasPorNombre.mockResolvedValue(new Set(['A']));
    mp.detalleLicitacion.mockRejectedValue(
      new MercadoPublicoError('sin cupo', 429),
    );
    const resumen = resumenVacio();

    await historia.cargarHistoria(resumen, Date.now(), 'reloj');

    expect(resumen.historia.estado).toBe('cortada');
    expect(repo.marcarDiaDeHistoria).not.toHaveBeenCalled();
  });

  it('una falla de la base en un día no tumba la corrida: el día queda en error y la historia para (18-10)', async () => {
    // Lo que pasó la noche del 18-10: un día con una licitación repetida
    // hizo que la base rechazara el lote, y las dos pasadas terminaron en
    // error aunque lo de hoy ya estaba traído y leído.
    jest.spyOn(Date, 'now').mockReturnValue(NOCHE);
    const { mp, repo, lectura, historia } = armar();
    repo.siguienteDiaDeHistoria.mockResolvedValue('2026-10-13');
    mp.licitacionesDelDia.mockResolvedValue([
      { CodigoExterno: 'A', Nombre: 'Cena aniversario' },
    ]);
    lectura.candidatasPorNombre.mockResolvedValue(new Set(['A']));
    repo.guardarProcesos.mockRejectedValue({
      code: '21000',
      message: 'ON CONFLICT DO UPDATE command cannot affect row a second time',
    });
    const resumen = resumenVacio();

    await expect(
      historia.cargarHistoria(resumen, Date.now(), 'reloj'),
    ).resolves.toBeUndefined();

    expect(repo.marcarDiaDeHistoria).toHaveBeenCalledWith('2026-10-13', {
      estado: 'error',
      error:
        '21000: ON CONFLICT DO UPDATE command cannot affect row a second time',
    });
    expect(repo.siguienteDiaDeHistoria).toHaveBeenCalledTimes(1);
    expect(resumen.historia.estado).toBe('falla');
    expect(resumen.avisos.join(' ')).toContain('el día 2026-10-13 falló');
  });

  it('si el filtro no responde, el día queda pendiente', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOCHE);
    const { mp, repo, lectura, historia } = armar();
    repo.siguienteDiaDeHistoria.mockResolvedValue('2025-10-03');
    mp.licitacionesDelDia.mockResolvedValue([
      { CodigoExterno: 'A', Nombre: 'Cena aniversario' },
    ]);
    lectura.candidatasPorNombre.mockResolvedValue(null);
    const resumen = resumenVacio();

    await historia.cargarHistoria(resumen, Date.now(), 'reloj');

    expect(resumen.historia.estado).toBe('cortada');
    expect(repo.marcarDiaDeHistoria).not.toHaveBeenCalled();
    expect(mp.detalleLicitacion).not.toHaveBeenCalled();
  });

  it('la gran descarga: de noche sigue hasta la hora que le da el reloj, más allá de los 130 minutos (19-10)', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOCHE);
    const { mp, repo, lectura, historia } = armar();
    repo.siguienteDiaDeHistoria
      .mockResolvedValueOnce('2025-10-03')
      .mockResolvedValue(null);
    mp.licitacionesDelDia.mockResolvedValue([
      { CodigoExterno: 'A', Nombre: 'Cena aniversario' },
    ]);
    lectura.candidatasPorNombre.mockResolvedValue(new Set(['A']));
    const resumen = resumenVacio();
    // La corrida partió hace 140 minutos: con el presupuesto de antes ya no
    // cargaba nada; el reloj le da hasta dentro de una hora.
    const inicio = NOCHE - 140 * 60_000;

    await historia.cargarHistoria(resumen, inicio, 'reloj', {
      hasta: NOCHE + 60 * 60_000,
    });

    expect(resumen.historia).toMatchObject({ estado: 'completa', dias: 1 });
    expect(repo.marcarDiaDeHistoria).toHaveBeenCalledWith(
      '2025-10-03',
      expect.objectContaining({ estado: 'hecha' }),
    );
  });

  it('nunca pasa las 2 h 45 desde que partió la corrida, aunque el reloj le dé más: a las 3 horas se da por colgada', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOCHE);
    const { repo, historia } = armar();
    const resumen = resumenVacio();

    await historia.cargarHistoria(resumen, NOCHE - 170 * 60_000, 'reloj', {
      hasta: NOCHE + 60 * 60_000,
    });

    expect(repo.siguienteDiaDeHistoria).not.toHaveBeenCalled();
  });

  it('se salta las unidades de compra de otras regiones: ni la IA las lee ni se pide su detalle; las que no conoce, sí (19-10)', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOCHE);
    const { mp, repo, lectura, unidades, historia, guardados } = armar();
    repo.siguienteDiaDeHistoria
      .mockResolvedValueOnce('2025-10-03')
      .mockResolvedValue(null);
    unidades.regionesDeLasUnidades.mockResolvedValue(
      new Map([
        ['4364', ['Región del Ñuble']],
        ['1111', ['Región Metropolitana de Santiago']],
        ['2222', ['Región de Valparaíso', 'Región del Biobío']],
      ]),
    );
    mp.licitacionesDelDia.mockResolvedValue([
      { CodigoExterno: '4364-5-LE25', Nombre: 'Día del profesor' },
      { CodigoExterno: '1111-9-LE25', Nombre: 'Cena aniversario' },
      { CodigoExterno: '2222-3-LE25', Nombre: 'Almuerzo de camaradería' },
      { CodigoExterno: '9999-1-LE25', Nombre: 'Coffee break' },
    ]);
    lectura.candidatasPorNombre.mockImplementation(
      (filas: Array<{ codigo: string }>) =>
        Promise.resolve(new Set(filas.map((f) => f.codigo))),
    );
    const resumen = resumenVacio();

    await historia.cargarHistoria(resumen, Date.now(), 'reloj', {
      regiones: ['Ñuble', 'Biobío'],
    });

    expect(lectura.candidatasPorNombre).toHaveBeenCalledWith(
      [
        { codigo: '4364-5-LE25', nombre: 'Día del profesor' },
        { codigo: '2222-3-LE25', nombre: 'Almuerzo de camaradería' },
        { codigo: '9999-1-LE25', nombre: 'Coffee break' },
      ],
      expect.any(Object),
    );
    expect(guardados()).toEqual(['4364-5-LE25', '2222-3-LE25', '9999-1-LE25']);
    // El día cuenta todo lo listado; las candidatas son lo que se pidió.
    expect(repo.marcarDiaDeHistoria).toHaveBeenCalledWith(
      '2025-10-03',
      expect.objectContaining({ listadas: 4, candidatas: 3 }),
    );
  });

  it('si el mapa de unidades falla, no filtra por región y la historia sigue', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOCHE);
    const { mp, repo, lectura, unidades, historia } = armar();
    repo.siguienteDiaDeHistoria
      .mockResolvedValueOnce('2025-10-03')
      .mockResolvedValue(null);
    unidades.regionesDeLasUnidades.mockRejectedValue(new Error('sin base'));
    mp.licitacionesDelDia.mockResolvedValue([
      { CodigoExterno: '1111-9-LE25', Nombre: 'Cena aniversario' },
    ]);
    lectura.candidatasPorNombre.mockResolvedValue(new Set(['1111-9-LE25']));
    const resumen = resumenVacio();

    await historia.cargarHistoria(resumen, Date.now(), 'reloj', {
      regiones: ['Ñuble'],
    });

    expect(mp.detalleLicitacion).toHaveBeenCalledWith('1111-9-LE25');
    expect(resumen.historia.estado).toBe('completa');
  });
});
