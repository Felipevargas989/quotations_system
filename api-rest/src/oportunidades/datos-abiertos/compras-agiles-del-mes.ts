import type { FilaDelCsv } from './csv';
import {
  codigoDelRubro,
  esPeso,
  fecha,
  limpio,
  codigo as llave,
  nombreDelRubro,
  numero,
} from './datos-abiertos';

// LAS COMPRAS ÁGILES DE UN MES (decisión 101 del doc 17). El archivo trae
// una fila por producto de cada cotización (1,36 millones en octubre 2025).
// Se lee dos veces para no tenerlo todo en memoria:
//  1. Los totales de TODAS por unidad de compra, y cuáles son del rubro.
//  2. Solo las del rubro, con cada cotización.
// El monto de una cotización se repite en cada producto: se cuenta una vez.
// Si un proveedor manda varias alternativas, vale la más barata, o la
// elegida si alguna lo fue.

export type CompraAgilDelMercado = {
  codigo: string;
  mes: string;
  nombre: string | null;
  organismo: string | null;
  unidad_codigo: string | null;
  unidad: string | null;
  rut_unidad: string | null;
  region: string | null;
  fecha_publicacion: string | null;
  fecha_cierre: string | null;
  moneda: string | null;
  monto_disponible: number | null;
  estado: string | null;
  cotizaciones: number;
  rut_elegido: string | null;
  proveedor_elegido: string | null;
  monto_elegido: number | null;
  criterio: string | null;
  productos: string | null;
};

export type CotizacionDelMercado = {
  codigo: string;
  rut: string;
  proveedor: string | null;
  tamano: string | null;
  moneda: string | null;
  monto: number | null;
  elegida: boolean;
};

export type TotalDeCompraAgil = {
  mes: string;
  unidad_codigo: string;
  rut_unidad: string | null;
  unidad: string | null;
  organismo: string | null;
  region: string | null;
  solicitudes: number;
  con_elegido: number;
  monto_elegido: number;
  solicitudes_rubro: number;
  monto_rubro: number;
};

export type ComprasAgilesDelMes = {
  solicitudes: CompraAgilDelMercado[];
  cotizaciones: CotizacionDelMercado[];
  totales: TotalDeCompraAgil[];
  filas: number;
  todas: number;
};

const elegida = (f: FilaDelCsv) =>
  /^s[ií]$/i.test((f['ProveedorSeleccionado'] ?? '').trim());

const menor = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.min(a, b);

/** Lo que vale una cotización en pesos (null si viene en otra moneda). */
const montoEnPesos = (f: FilaDelCsv) =>
  esPeso(f['moneda']) ? numero(f['MontoTotal']) : null;

/** El organismo que compra. Los archivos hasta septiembre de 2025 no traen
 *  `NombreOOPP`: ahí el organismo es la razón social de la unidad. */
const organismoDe = (f: FilaDelCsv) =>
  limpio(f['NombreOOPP']) ?? limpio(f['RazonSocialUnidaddeCompra']);

export async function comprasAgilesDelMes(
  leer: () => AsyncIterable<FilaDelCsv>,
  mes: string,
): Promise<ComprasAgilesDelMes> {
  // 1. Todas: a qué unidad pertenece cada una, lo elegido y el rubro.
  const unidadDe = new Map<string, string>();
  const elegidoDe = new Map<string, number | null>();
  const delRubro = new Set<string>();
  const unidades = new Map<string, TotalDeCompraAgil>();
  let filas = 0;
  for await (const f of leer()) {
    filas++;
    const codigo = llave(f['CodigoCotizacion']);
    if (!codigo) continue;
    if (!unidadDe.has(codigo)) {
      const unidad =
        limpio(f['CodigoUnidaddeCompra'], 20) ??
        limpio(f['RUTUnidaddeCompra'], 20) ??
        'sin unidad';
      unidadDe.set(codigo, unidad);
      if (!unidades.has(unidad)) {
        unidades.set(unidad, {
          mes,
          unidad_codigo: unidad,
          rut_unidad: limpio(f['RUTUnidaddeCompra'], 20),
          unidad: limpio(f['NombreUnidaddeCompra']),
          organismo: organismoDe(f),
          region: limpio(f['Region'], 80),
          solicitudes: 0,
          con_elegido: 0,
          monto_elegido: 0,
          solicitudes_rubro: 0,
          monto_rubro: 0,
        });
      }
      if (nombreDelRubro(f['NombreCotizacion'])) delRubro.add(codigo);
    }
    if (codigoDelRubro(f['CodigoProducto'])) delRubro.add(codigo);
    if (elegida(f)) {
      elegidoDe.set(
        codigo,
        menor(elegidoDe.get(codigo) ?? null, montoEnPesos(f)),
      );
    }
  }
  for (const [codigo, unidad] of unidadDe) {
    const t = unidades.get(unidad)!;
    const rubro = delRubro.has(codigo);
    t.solicitudes++;
    if (rubro) t.solicitudes_rubro++;
    if (elegidoDe.has(codigo)) {
      t.con_elegido++;
      const monto = elegidoDe.get(codigo) ?? 0;
      t.monto_elegido += monto;
      if (rubro) t.monto_rubro += monto;
    }
  }

  // 2. Solo las del rubro, con cada cotización.
  const solicitudes = new Map<string, CompraAgilDelMercado>();
  const productos = new Map<string, Set<string>>();
  const cotizaciones = new Map<string, CotizacionDelMercado>();
  for await (const f of leer()) {
    if (!delRubro.has((f['CodigoCotizacion'] ?? '').trim())) continue;
    const codigo = llave(f['CodigoCotizacion']);
    let s = solicitudes.get(codigo);
    if (!s) {
      s = {
        codigo,
        mes,
        nombre: limpio(f['NombreCotizacion']),
        organismo: organismoDe(f),
        unidad_codigo: limpio(f['CodigoUnidaddeCompra'], 20),
        unidad: limpio(f['NombreUnidaddeCompra']),
        rut_unidad: limpio(f['RUTUnidaddeCompra'], 20),
        region: limpio(f['Region'], 80),
        fecha_publicacion: fecha(f['FechaPublicacionParaCotizar']),
        fecha_cierre: fecha(f['FechaCierreParaCotizar']),
        moneda: limpio(f['moneda'], 10),
        monto_disponible: numero(f['MontoTotalDisponble']),
        estado: limpio(f['Estado'], 60),
        cotizaciones: 0,
        rut_elegido: null,
        proveedor_elegido: null,
        monto_elegido: null,
        criterio: null,
        productos: null,
      };
      solicitudes.set(codigo, s);
      productos.set(codigo, new Set());
    }
    const producto = limpio(f['NombreProductoGenerico'], 80);
    if (producto) productos.get(codigo)!.add(producto);
    const rut = limpio(f['RUTProveedor'], 20);
    if (!rut) continue;
    const clave = `${codigo}|${rut}`;
    let c = cotizaciones.get(clave);
    if (!c) {
      c = {
        codigo,
        rut,
        proveedor: limpio(f['RazonSocialProveedor']),
        tamano: limpio(f['Tamano'], 20),
        moneda: limpio(f['moneda'], 10),
        monto: null,
        elegida: false,
      };
      cotizaciones.set(clave, c);
    }
    const monto = montoEnPesos(f);
    if (elegida(f)) {
      // La elegida manda sobre las alternativas que no lo fueron.
      c.monto = c.elegida ? menor(c.monto, monto) : monto;
      c.elegida = true;
      s.rut_elegido = rut;
      s.proveedor_elegido = c.proveedor;
      s.criterio = limpio(f['NombreCriterio'], 200);
    } else if (!c.elegida) {
      c.monto = menor(c.monto, monto);
    }
  }
  for (const c of cotizaciones.values()) {
    const s = solicitudes.get(c.codigo)!;
    s.cotizaciones++;
    if (c.elegida) s.monto_elegido = c.monto;
  }
  for (const [codigo, s] of solicitudes) {
    s.productos = limpio([...productos.get(codigo)!].join(' · '), 300);
  }
  return {
    solicitudes: [...solicitudes.values()],
    cotizaciones: [...cotizaciones.values()],
    totales: [...unidades.values()],
    filas,
    todas: unidadDe.size,
  };
}
