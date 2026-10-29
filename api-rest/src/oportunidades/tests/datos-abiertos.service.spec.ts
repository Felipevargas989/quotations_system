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
  mesesAtras,
  ordenesAlDia,
} from '../datos-abiertos/datos-abiertos.service';
import type { LicitacionesDelMes } from '../datos-abiertos/licitaciones-del-mes';
import type { OrdenesDeCompraDelMes } from '../datos-abiertos/ordenes-de-compra-del-mes';
import {
  csvDePrueba,
  filaDeCompraAgil,
  filaDeLicitacion,
  filaDeOrdenDeCompra,
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
  ordenes: Array<{ mes: string; del: OrdenesDeCompraDelMes }> = [];
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
  guardarOrdenesDeCompra = jest.fn(
    (mes: string, del: OrdenesDeCompraDelMes) => {
      this.ordenes.push({ mes, del });
      return Promise.resolve();
    },
  );
}

const [MES] = mesesHaciaAtras(new Date(), 1);
const DIA = diaUnoDe(MES);
const URL_LIC = urlDelArchivo('licitaciones', MES);
const URL_COT = urlDelArchivo('compra_agil', MES);
const URL_OC = urlDelArchivo('ordenes_de_compra', MES);
/** Cualquier mes de órdenes de compra trae la misma orden de prueba. */
const ZIP_OC = zipDePrueba([
  { nombre: 'oc.csv', contenido: csvDePrueba([filaDeOrdenDeCompra()]) },
]);
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
      await writeFile(
        ruta,
        ZIPS[url] ??
          (url.includes('/oc-da/') ? ZIP_OC : Buffer.from('no es un zip')),
      );
    },
  };
  return { repo, servicio, bajadas };
};

const UNA_HORA = () => Date.now() + 3_600_000;

describe('El cargador del mercado (decisión 101)', () => {
  it('baja las licitaciones, las compras ágiles y las órdenes de compra del mes, las guarda y las marca listas', async () => {
    const { repo, servicio, bajadas } = armar();
    const resumen = await servicio.cargar({
      hasta: UNA_HORA(),
      meses: 1,
      origen: 'prueba',
    });
    expect(resumen).toEqual({
      cargadas: 3,
      sinCambios: 0,
      sinPublicar: 0,
      errores: 0,
      pendientes: 0,
    });
    expect(bajadas).toEqual([URL_LIC, URL_COT, URL_OC]);
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
      {
        fuente: 'ordenes_de_compra',
        mes: DIA,
        estado: 'cargando',
        error: null,
      },
      { fuente: 'ordenes_de_compra', mes: DIA, estado: 'lista', error: null },
    ]);
    // Decisión 108: las órdenes municipales, guardadas en su mes.
    expect(repo.ordenes[0].mes).toBe(DIA);
    expect(repo.ordenes[0].del.ordenes.map((o) => o.codigo)).toEqual([
      '3497-120-SE26',
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
    expect(resumen).toMatchObject({ cargadas: 2, sinCambios: 1 });
    expect(bajadas).toEqual([URL_COT, URL_OC]);
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
    expect(resumen).toMatchObject({ cargadas: 2, sinPublicar: 1 });
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
      expect(resumen).toMatchObject({ cargadas: 2, errores: 1 });
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
    expect(resumen).toMatchObject({ cargadas: 0, pendientes: 3 });
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

  it('a mano se puede pedir solo una fuente', async () => {
    const { servicio, bajadas } = armar();
    const resumen = await servicio.cargar({
      hasta: UNA_HORA(),
      meses: 1,
      fuentes: ['ordenes_de_compra'],
      origen: 'prueba',
    });
    expect(resumen).toMatchObject({ cargadas: 1 });
    expect(bajadas).toEqual([URL_OC]);
  });

  it('de las órdenes de compra, cada noche el mes en curso y el anterior; un mes viejo se repasa una vez al mes (decisión 108)', async () => {
    const meses = mesesHaciaAtras(new Date(), 4);
    const dia = meses.map(diaUnoDe);
    const hace = (dias: number) =>
      new Date(Date.now() - dias * 86_400_000).toISOString();
    const lista = (mes: string, terminada: string) =>
      ({
        fuente: 'ordenes_de_compra',
        mes,
        estado: 'lista',
        // ChileCompra rehízo el archivo: la fecha ya no calza.
        archivo_modificado: 'Tue, 27 Oct 2026 10:00:00 GMT',
        terminada_en: terminada,
      }) as CargaDelMercado;
    const { repo, servicio, bajadas } = armar();
    repo.registradas = [
      lista(dia[0], hace(1)),
      lista(dia[1], hace(1)),
      lista(dia[2], hace(5)),
      lista(dia[3], hace(40)),
    ];
    const resumen = await servicio.cargar({
      hasta: UNA_HORA(),
      meses: 4,
      fuentes: ['ordenes_de_compra'],
      origen: 'prueba',
    });
    expect(resumen).toMatchObject({ cargadas: 3, sinCambios: 1 });
    expect(bajadas).toEqual([
      urlDelArchivo('ordenes_de_compra', meses[0]),
      urlDelArchivo('ordenes_de_compra', meses[1]),
      urlDelArchivo('ordenes_de_compra', meses[3]),
    ]);
  });

  it('cuántos meses atrás está un mes, en hora de Chile', () => {
    const hoy = new Date('2026-10-28T15:00:00Z');
    expect(mesesAtras({ anio: 2026, mes: 10 }, hoy)).toBe(0);
    expect(mesesAtras({ anio: 2026, mes: 8 }, hoy)).toBe(2);
    expect(mesesAtras({ anio: 2025, mes: 10 }, hoy)).toBe(12);
    // Un mes que nunca terminó de cargar no está al día.
    expect(
      ordenesAlDia(
        { anio: 2026, mes: 1 },
        { estado: 'error', terminada_en: hoy.toISOString() } as CargaDelMercado,
        hoy,
      ),
    ).toBe(false);
  });
});
