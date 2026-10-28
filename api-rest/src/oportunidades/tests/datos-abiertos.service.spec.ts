import type { PinoLogger } from 'nestjs-pino';
import { writeFile } from 'node:fs/promises';
import type { ComprasAgilesDelMes } from '../datos-abiertos/compras-agiles-del-mes';
import {
  diaUnoDe,
  mesesHaciaAtras,
  urlDelArchivo,
} from '../datos-abiertos/datos-abiertos';
import type {
  CargaDelMercado,
  DatosAbiertosRepository,
} from '../datos-abiertos/datos-abiertos.repository';
import {
  type CabeceraDelArchivo,
  DatosAbiertosService,
} from '../datos-abiertos/datos-abiertos.service';
import type { LicitacionesDelMes } from '../datos-abiertos/licitaciones-del-mes';
import {
  csvDePrueba,
  filaDeCompraAgil,
  filaDeLicitacion,
  zipDePrueba,
} from './datos-abiertos-de-prueba';

// EL CARGADOR DEL MERCADO (decisión 101): baja cada mes, lo guarda y no
// repite lo que no cambió.

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

class RepoDePrueba {
  registradas: CargaDelMercado[] = [];
  marcas: Array<{
    fuente: string;
    mes: string;
    estado?: string;
    error?: string | null;
  }> = [];
  licitaciones: LicitacionesDelMes[] = [];
  comprasAgiles: ComprasAgilesDelMes[] = [];
  cargas = jest.fn(() => Promise.resolve(this.registradas));
  marcarCarga = jest.fn(
    (
      fuente: string,
      mes: string,
      c: { estado?: string; error?: string | null },
    ) => {
      this.marcas.push({ fuente, mes, estado: c.estado, error: c.error });
      return Promise.resolve();
    },
  );
  guardarLicitaciones = jest.fn((l: LicitacionesDelMes) => {
    this.licitaciones.push(l);
    return Promise.resolve();
  });
  guardarComprasAgiles = jest.fn((_mes: string, c: ComprasAgilesDelMes) => {
    this.comprasAgiles.push(c);
    return Promise.resolve();
  });
}

const [MES] = mesesHaciaAtras(new Date(), 1);
const DIA = diaUnoDe(MES);
const URL_LIC = urlDelArchivo('licitaciones', MES);
const URL_COT = urlDelArchivo('compra_agil', MES);
const MODIFICADO = 'Wed, 28 Oct 2026 14:37:47 GMT';

const ZIPS: Record<string, Buffer> = {
  [URL_LIC]: zipDePrueba([
    { nombre: `lic_${DIA}.csv`, contenido: csvDePrueba([filaDeLicitacion()]) },
  ]),
  [URL_COT]: zipDePrueba([
    { nombre: 'COT1.csv', contenido: csvDePrueba([filaDeCompraAgil()]) },
    {
      nombre: 'COT2.csv',
      contenido: csvDePrueba([
        filaDeCompraAgil({ CodigoCotizacion: 'OTRA-COT26' }),
      ]),
    },
  ]),
};

const armar = (cabeceras: Record<string, CabeceraDelArchivo> = {}) => {
  const repo = new RepoDePrueba();
  const servicio = new DatosAbiertosService(
    repo as unknown as DatosAbiertosRepository,
    logger,
  );
  const bajadas: string[] = [];
  servicio.red = {
    cabecera: (url) =>
      Promise.resolve(
        cabeceras[url] ?? { existe: true, modificado: MODIFICADO, bytes: 10 },
      ),
    bajar: async (url, ruta) => {
      bajadas.push(url);
      await writeFile(ruta, ZIPS[url] ?? Buffer.from('no es un zip'));
    },
  };
  return { repo, servicio, bajadas };
};

const UNA_HORA = () => Date.now() + 3_600_000;

describe('El cargador del mercado (decisión 101)', () => {
  it('baja las licitaciones y las compras ágiles del mes, las guarda y las marca listas', async () => {
    const { repo, servicio, bajadas } = armar();
    const resumen = await servicio.cargar({
      hasta: UNA_HORA(),
      meses: 1,
      origen: 'prueba',
    });
    expect(resumen).toEqual({
      cargadas: 2,
      sinCambios: 0,
      sinPublicar: 0,
      errores: 0,
      pendientes: 0,
    });
    expect(bajadas).toEqual([URL_LIC, URL_COT]);
    expect(repo.licitaciones[0].licitaciones.map((l) => l.codigo)).toEqual([
      '4352-6-LE25',
    ]);
    // Las dos partes del archivo de compra ágil se leen como una.
    expect(repo.comprasAgiles[0].todas).toBe(2);
    expect(repo.marcas).toEqual([
      { fuente: 'licitaciones', mes: DIA, estado: 'cargando', error: null },
      { fuente: 'licitaciones', mes: DIA, estado: 'lista', error: null },
      { fuente: 'compra_agil', mes: DIA, estado: 'cargando', error: null },
      { fuente: 'compra_agil', mes: DIA, estado: 'lista', error: null },
    ]);
  });

  it('no vuelve a bajar un mes listo si el archivo no cambió', async () => {
    const { repo, servicio, bajadas } = armar();
    repo.registradas = [
      {
        fuente: 'licitaciones',
        mes: DIA,
        estado: 'lista',
        archivo_modificado: MODIFICADO,
      } as CargaDelMercado,
    ];
    const resumen = await servicio.cargar({
      hasta: UNA_HORA(),
      meses: 1,
      origen: 'prueba',
    });
    expect(resumen).toMatchObject({ cargadas: 1, sinCambios: 1 });
    expect(bajadas).toEqual([URL_COT]);
  });

  it('lo que ChileCompra todavía no publica se salta sin marcar nada', async () => {
    const { repo, servicio } = armar({
      [URL_COT]: { existe: false, modificado: null, bytes: null },
    });
    const resumen = await servicio.cargar({
      hasta: UNA_HORA(),
      meses: 1,
      origen: 'prueba',
    });
    expect(resumen).toMatchObject({ cargadas: 1, sinPublicar: 1 });
    expect(repo.marcas.some((m) => m.fuente === 'compra_agil')).toBe(false);
  });

  it('un archivo malo queda en «error» con su motivo, y la carga sigue con el resto', async () => {
    const { repo, servicio } = armar();
    delete ZIPS[URL_LIC];
    try {
      const resumen = await servicio.cargar({
        hasta: UNA_HORA(),
        meses: 1,
        origen: 'prueba',
      });
      expect(resumen).toMatchObject({ cargadas: 1, errores: 1 });
      expect(repo.marcas[1]).toEqual({
        fuente: 'licitaciones',
        mes: DIA,
        estado: 'error',
        error: 'el archivo no es un ZIP',
      });
    } finally {
      ZIPS[URL_LIC] = zipDePrueba([
        {
          nombre: `lic_${DIA}.csv`,
          contenido: csvDePrueba([filaDeLicitacion()]),
        },
      ]);
    }
  });

  it('pasada la hora tope no empieza otro mes', async () => {
    const { servicio, bajadas } = armar();
    const resumen = await servicio.cargar({
      hasta: Date.now() - 1,
      meses: 1,
      origen: 'prueba',
    });
    expect(resumen).toMatchObject({ cargadas: 0, pendientes: 2 });
    expect(bajadas).toEqual([]);
  });

  it('una sola carga a la vez', async () => {
    const { servicio } = armar();
    const primera = servicio.cargar({
      hasta: UNA_HORA(),
      meses: 1,
      origen: 'prueba',
    });
    expect(servicio.enMarcha).toBe(true);
    expect(
      servicio.iniciar({ hasta: UNA_HORA(), meses: 1, origen: 'manual' }),
    ).toBe(false);
    expect(
      await servicio.cargar({ hasta: UNA_HORA(), meses: 1, origen: 'prueba' }),
    ).toBeNull();
    await primera;
    expect(servicio.enMarcha).toBe(false);
  });
});
