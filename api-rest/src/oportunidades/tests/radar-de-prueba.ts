import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { HistoriaRepository } from '../historia/historia.repository';
import { HistoriaService } from '../historia/historia.service';
import type {
  LecturaService,
  ProcesoParaLeer,
} from '../lectura/lectura.service';
import {
  type MercadoPublicoClient,
  MercadoPublicoError,
} from '../mercado-publico/mercado-publico.client';
import type {
  OportunidadesRepository,
  ProcesoConocido,
} from '../oportunidades.repository';
import { RadarService } from '../radar.service';

// LO COMÚN DE LAS PRUEBAS DEL RADAR: la empresa, los procesos y el radar
// con todo de mentira. Aparte para que las pruebas no pasen las 800
// líneas del portero (18-10).

export const VDS = {
  id: 1,
  name: 'Valle del Sol',
  high_value_threshold: 3_000_000,
};
export const CONFIG_VDS = {
  regiones: ['Ñuble', 'Biobío'],
  comunas_cercanas: ['Quillón', 'Bulnes'],
  perfil: 'Complejo turístico en Quillón',
};

// Como la entrega la API: hora de Chile sin zona.
export const detalle = (codigo: string) => ({
  CodigoExterno: codigo,
  Nombre: `Proceso ${codigo}`,
  Comprador: {
    NombreOrganismo: 'Municipalidad de Chillán',
    RegionUnidad: 'Región del Ñuble',
  },
  Fechas: { FechaCierre: '2026-10-30T15:00:00' },
});

export const abierto = (
  codigo: string,
  extra: Partial<ProcesoParaLeer> = {},
): ProcesoParaLeer => ({
  codigo,
  tipo: 'licitacion',
  nombre: `Proceso ${codigo}`,
  descripcion: null,
  organismo: 'Municipalidad de Chillán',
  unidad: null,
  comuna: null,
  region: 'Región del Ñuble',
  monto: null,
  fecha_cierre: '2026-10-30T18:00:00.000Z',
  productos: [],
  ...extra,
});

export const caida = (status = 504) =>
  new MercadoPublicoError(`Mercado Público respondió ${status}`, status);

/** `base` = lo que ya está en mp_procesos (código → cierre y estado,
 *  como los devuelve Postgres). */
export function armar(base = new Map<string, ProcesoConocido>()) {
  const leidas = new Set<string>();
  const releer = new Set<string>();
  const mp = {
    configurado: true,
    licitacionesActivas: jest.fn().mockResolvedValue([]),
    detalleLicitacion: jest.fn((codigo: string) =>
      Promise.resolve(detalle(codigo)),
    ),
    comprasAgiles: jest.fn().mockResolvedValue([]),
    detalleCompraAgil: jest.fn().mockResolvedValue(null),
    licitacionesDelDia: jest.fn().mockResolvedValue([]),
  };
  const repo = {
    tomarCorrida: jest.fn().mockResolvedValue(7),
    abandonarCorridasDeAntes: jest.fn().mockResolvedValue(0),
    procesosPorAdjudicar: jest.fn().mockResolvedValue([]),
    siguienteDiaDeHistoria: jest.fn().mockResolvedValue(null),
    marcarDiaDeHistoria: jest.fn().mockResolvedValue(undefined),
    terminarCorrida: jest.fn().mockResolvedValue(undefined),
    procesosConocidos: jest.fn((codigos: string[]) =>
      Promise.resolve(
        new Map([...base].filter(([codigo]) => codigos.includes(codigo))),
      ),
    ),
    guardarProcesos: jest.fn().mockResolvedValue(undefined),
    actualizarCierre: jest.fn().mockResolvedValue(undefined),
    registrarCambios: jest.fn().mockResolvedValue(undefined),
    procesosAbiertos: jest.fn().mockResolvedValue([]),
    comprasAgilesSinDetalle: jest.fn().mockResolvedValue([]),
    empresasConModulo: jest.fn().mockResolvedValue([VDS]),
    configDe: jest.fn().mockResolvedValue(CONFIG_VDS),
    catalogoResumido: jest.fn().mockResolvedValue({
      paquetes: ['Evento: matrimonio'],
      fijos: ['Garzón'],
    }),
    // Como la base: lo que se guarda queda leído para la pasada siguiente;
    // lo de `releer` se leyó con reglas viejas y nadie lo ha tocado.
    lecturasDe: jest.fn(() =>
      Promise.resolve({
        hechas: new Set(leidas),
        releer: new Set([...releer].filter((c) => !leidas.has(c))),
      }),
    ),
    guardarLectura: jest.fn((_empresa: number, codigo: string) => {
      leidas.add(codigo);
      return Promise.resolve();
    }),
  };
  const lectura = {
    configurado: true,
    candidatasPorNombre: jest.fn().mockResolvedValue(new Set<string>()),
    leer: jest.fn().mockResolvedValue({
      semaforo: 'verde',
      etiquetas: ['evento'],
      se_hace_en_el_complejo: 'si',
      razon: 'Es un evento.',
    }),
  };
  const historia = new HistoriaService(
    mp as unknown as MercadoPublicoClient,
    repo as unknown as OportunidadesRepository,
    lectura as unknown as LecturaService,
    {
      regionesDeLasUnidades: jest.fn().mockResolvedValue(new Map()),
    } as unknown as HistoriaRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  const radar = new RadarService(
    mp as unknown as MercadoPublicoClient,
    repo as unknown as OportunidadesRepository,
    lectura as unknown as LecturaService,
    historia,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { mp, repo, lectura, radar, leidas, releer };
}

export const guardados = (repo: ReturnType<typeof armar>['repo']) =>
  repo.guardarProcesos.mock.calls.flatMap(([lote]) =>
    (lote as Array<{ codigo: string }>).map((p) => p.codigo),
  );
