import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { LicifyService } from '../adjuntos/licify.service';
import type {
  AnalisisRepository,
  ValidacionRepository,
} from '../analisis/analisis.repository';
import type { ResultadosRepository } from '../competencia/resultados.repository';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import { MisLicitacionesService } from '../mias/mis-licitaciones.service';
import type { OportunidadesRepository } from '../oportunidades.repository';

// "MIS LICITACIONES" (Felipe, 17-10: "¿dónde van a quedar compiladas las
// que sí me interesan para luego trabajarlas?"): las marcadas, de la que
// cierra antes a la que cierra después, con el avance de cada una.

const fila = (id: number, cierre: string | null, estado = 'en_estudio') => ({
  id,
  codigo: `C-${id}`,
  estado,
  proceso: { nombre: `Licitación ${id}`, fecha_cierre: cierre },
});

function armar() {
  const oportunidades = {
    mias: jest
      .fn()
      .mockResolvedValue([
        fila(87, '2026-10-19T18:01:00.000Z'),
        fila(40, '2026-10-19T18:01:00.000Z', 'postulada'),
        fila(12, '2026-10-18T15:00:00.000Z'),
      ]),
  };
  const adjuntos = {
    origenesDe: jest.fn().mockResolvedValue([
      { oportunidad_id: 40, seccion: 'bases', origen: 'subido' },
      { oportunidad_id: 40, seccion: 'bases', origen: 'subido' },
      // El Word 5 ya tiene su firmado (decisión 58: no cuenta como sin
      // firmar); el 6, no.
      {
        id: 5,
        oportunidad_id: 40,
        seccion: 'postulacion',
        origen: 'generado',
        viene_de: 1,
      },
      {
        id: 6,
        oportunidad_id: 40,
        seccion: 'postulacion',
        origen: 'generado',
        viene_de: 1,
      },
      {
        id: 7,
        oportunidad_id: 40,
        seccion: 'postulacion',
        origen: 'firmado',
        viene_de: 5,
      },
      { id: 8, oportunidad_id: 40, seccion: 'postulacion', origen: 'subido' },
    ]),
  };
  // Llegan del más nuevo al más viejo.
  const analisis = {
    ultimosDe: jest.fn().mockResolvedValue([
      { oportunidad_id: 40, estado: 'listo', creado_en: '2026-10-17T15:00Z' },
      { oportunidad_id: 40, estado: 'error', creado_en: '2026-10-17T13:00Z' },
      {
        oportunidad_id: 87,
        estado: 'procesando',
        creado_en: '2026-10-17T16:00Z',
      },
    ]),
  };
  const validacion = {
    ultimosDe: jest.fn().mockResolvedValue([
      {
        oportunidad_id: 40,
        estado: 'listo',
        creado_en: '2026-10-17T17:00Z',
        listo: 'casi',
      },
    ]),
  };
  const generacion = {
    ultimosDe: jest.fn().mockResolvedValue([
      {
        oportunidad_id: 40,
        estado: 'listo',
        creado_en: '2026-10-17T16:30Z',
        tipo: 'firma',
      },
      {
        oportunidad_id: 40,
        estado: 'listo',
        creado_en: '2026-10-17T16:00Z',
        tipo: 'anexos',
      },
      {
        oportunidad_id: 40,
        estado: 'error',
        creado_en: '2026-10-17T15:30Z',
        tipo: 'propuesta',
      },
      {
        oportunidad_id: 40,
        estado: 'listo',
        creado_en: '2026-10-17T15:00Z',
        tipo: 'oferta',
      },
      // La 87: la IA armando «1. Qué ofreces» (23-10).
      {
        oportunidad_id: 87,
        estado: 'procesando',
        creado_en: '2026-10-23T22:50Z',
        tipo: 'oferta',
      },
    ]),
  };
  // «Traer los documentos» corriendo solo en la 87 (23-10).
  const licify = {
    estaTrayendo: jest.fn(
      (empresa: number, id: number) => empresa === 1 && id === 87,
    ),
  };
  const servicio = new MisLicitacionesService(
    oportunidades as unknown as OportunidadesRepository,
    adjuntos as unknown as AdjuntosRepository,
    analisis as unknown as AnalisisRepository,
    validacion as unknown as ValidacionRepository,
    generacion as unknown as GeneracionRepository,
    licify as unknown as LicifyService,
  );
  return {
    oportunidades,
    adjuntos,
    analisis,
    validacion,
    generacion,
    licify,
    servicio,
  };
}

describe('MisLicitacionesService', () => {
  it('de la que cierra antes a la que cierra después, todo de la empresa de la sesión', async () => {
    const { adjuntos, analisis, servicio } = armar();
    const lista = await servicio.mias(1);
    expect(lista.map((l) => l.id)).toEqual([12, 87, 40]);
    expect(adjuntos.origenesDe).toHaveBeenCalledWith(1, [87, 40, 12]);
    expect(analisis.ultimosDe).toHaveBeenCalledWith(1, [87, 40, 12]);
  });

  it('el avance: archivos por sección y origen, y el último trabajo de cada tipo', async () => {
    const { servicio } = armar();
    const lista = await servicio.mias(1);
    expect(lista.find((l) => l.id === 40)?.avance).toEqual({
      bases: 2,
      trayendo: false,
      analisis: 'listo',
      anexos: 'listo',
      propuesta: 'error',
      oferta: 'listo',
      postulacion: 4,
      // Sin firmar: solo el Word 6 (el 5 ya tiene su firmado).
      generados: 1,
      firmados: 1,
      validacion: { estado: 'listo', listo: 'casi' },
    });
    // La 87: el motor está trayendo sus documentos (la etapa Bases gira).
    expect(lista.find((l) => l.id === 87)?.avance).toEqual({
      bases: 0,
      trayendo: true,
      analisis: 'procesando',
      anexos: null,
      propuesta: null,
      oferta: 'procesando',
      postulacion: 0,
      generados: 0,
      firmados: 0,
      validacion: null,
    });
  });

  it('sin ninguna marcada no pregunta nada más', async () => {
    const { oportunidades, adjuntos, servicio } = armar();
    oportunidades.mias.mockResolvedValue([]);
    await expect(servicio.mias(1)).resolves.toEqual([]);
    expect(adjuntos.origenesDe).not.toHaveBeenCalled();
  });
  it('decisión 92: las ganadas y perdidas traen su resultado, a quién eligieron y por cuánto', async () => {
    const {
      oportunidades,
      adjuntos,
      analisis,
      validacion,
      generacion,
      licify,
    } = armar();
    oportunidades.mias.mockResolvedValue([
      fila(3219, '2026-10-23T16:00:00.000Z', 'perdida'),
      fila(40, '2026-10-19T18:01:00.000Z', 'postulada'),
    ]);
    const resultados = {
      resultadosDe: jest.fn().mockResolvedValue(
        new Map([
          [
            'C-3219',
            {
              estado: 'perdida',
              proveedor: 'BPM EVENTOS SPA',
              rut_proveedor: '76.430.926-k',
              monto: 6_800_000,
              mi_monto: 7_090_000,
              lugar: 2,
              ofertas: 2,
              era_la_mas_barata: false,
              inadmisible: null,
            },
          ],
        ]),
      ),
    };
    const servicio = new MisLicitacionesService(
      oportunidades as unknown as OportunidadesRepository,
      adjuntos as unknown as AdjuntosRepository,
      analisis as unknown as AnalisisRepository,
      validacion as unknown as ValidacionRepository,
      generacion as unknown as GeneracionRepository,
      licify as unknown as LicifyService,
      resultados as unknown as ResultadosRepository,
    );
    const lista = await servicio.mias(1);
    // Solo se pregunta por las que ya terminaron.
    expect(resultados.resultadosDe).toHaveBeenCalledWith(['C-3219']);
    expect(lista.find((m) => m.id === 3219)?.resultado).toMatchObject({
      proveedor: 'BPM EVENTOS SPA',
      monto: 6_800_000,
      mi_monto: 7_090_000,
    });
    expect(lista.find((m) => m.id === 40)?.resultado).toBeNull();
  });
});
