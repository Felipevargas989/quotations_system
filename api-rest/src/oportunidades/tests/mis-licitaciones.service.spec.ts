import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type {
  AnalisisRepository,
  ValidacionRepository,
} from '../analisis/analisis.repository';
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
    ]),
  };
  const servicio = new MisLicitacionesService(
    oportunidades as unknown as OportunidadesRepository,
    adjuntos as unknown as AdjuntosRepository,
    analisis as unknown as AnalisisRepository,
    validacion as unknown as ValidacionRepository,
    generacion as unknown as GeneracionRepository,
  );
  return {
    oportunidades,
    adjuntos,
    analisis,
    validacion,
    generacion,
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
      analisis: 'listo',
      anexos: 'listo',
      propuesta: 'error',
      postulacion: 4,
      // Sin firmar: solo el Word 6 (el 5 ya tiene su firmado).
      generados: 1,
      firmados: 1,
      validacion: { estado: 'listo', listo: 'casi' },
    });
    expect(lista.find((l) => l.id === 87)?.avance).toEqual({
      bases: 0,
      analisis: 'procesando',
      anexos: null,
      propuesta: null,
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
});
