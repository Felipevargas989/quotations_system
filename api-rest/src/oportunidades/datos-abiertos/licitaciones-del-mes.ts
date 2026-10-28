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

// LAS LICITACIONES DE UN MES (decisión 101 del doc 17). El archivo trae una
// fila por cada línea de cada oferta: aquí quedan una por licitación y una
// por proveedor que ofertó. Lo adjudicado se recalcula: precio unitario por
// cantidad adjudicada, sin pasar de la cantidad ofertada. Medido en octubre
// 2025: hay compradores que escriben el monto en la cantidad (la cena de
// Coelemu, 12.442.640 «personas»), y así una línea sumaba billones.

export type LicitacionDelMercado = {
  codigo: string;
  mes: string;
  nombre: string | null;
  tipo: string | null;
  estado: string | null;
  sector: string | null;
  organismo_codigo: string | null;
  organismo: string | null;
  unidad_codigo: string | null;
  unidad: string | null;
  rut_unidad: string | null;
  comuna: string | null;
  region: string | null;
  fecha_publicacion: string | null;
  fecha_cierre: string | null;
  fecha_adjudicacion: string | null;
  moneda: string | null;
  monto_estimado: number | null;
  monto_adjudicado: number | null;
  oferentes: number | null;
  lineas: number;
  rubros: string[];
  del_rubro: boolean;
};

export type OfertaDelMercado = {
  codigo: string;
  rut: string;
  proveedor: string | null;
  moneda: string | null;
  monto_ofertado: number | null;
  monto_adjudicado: number | null;
  lineas_ofertadas: number;
  lineas_ganadas: number;
  gano: boolean;
};

export type LicitacionesDelMes = {
  licitaciones: LicitacionDelMercado[];
  ofertas: OfertaDelMercado[];
  filas: number;
};

/** Sin los decimales que deja la coma flotante (69747,9 × 200). */
const centavos = (n: number) => Math.round(n * 100) / 100;

/** Lo adjudicado en una línea, sin pasar de lo que el proveedor ofertó. */
export const montoDeLaLinea = (fila: FilaDelCsv): number | null => {
  const unitario = numero(fila['MontoUnitarioOferta']);
  let cantidad = numero(fila['CantidadAdjudicada']);
  if (unitario === null || cantidad === null || cantidad <= 0) return null;
  const ofertada = numero(fila['Cantidad Ofertada']);
  if (ofertada !== null && ofertada > 0 && cantidad > ofertada) {
    cantidad = ofertada;
  }
  return centavos(unitario * cantidad);
};

const suma = (a: number | null, b: number | null) =>
  b === null ? a : centavos((a ?? 0) + b);

export async function licitacionesDelMes(
  filas: AsyncIterable<FilaDelCsv>,
  mes: string,
): Promise<LicitacionesDelMes> {
  const licitaciones = new Map<string, LicitacionDelMercado>();
  const lineas = new Map<string, Set<string>>();
  const rubros = new Map<string, Set<string>>();
  const ofertas = new Map<string, OfertaDelMercado>();
  const lineasDeLaOferta = new Map<string, Set<string>>();
  let total = 0;
  for await (const f of filas) {
    total++;
    const codigo = llave(f['CodigoExterno']);
    if (!codigo) continue;
    let l = licitaciones.get(codigo);
    if (!l) {
      l = {
        codigo,
        mes,
        nombre: limpio(f['Nombre']),
        tipo: limpio(f['Tipo'], 10),
        estado: limpio(f['Estado'], 60),
        sector: limpio(f['sector'], 60),
        organismo_codigo: limpio(f['CodigoOrganismo'], 20),
        organismo: limpio(f['NombreOrganismo']),
        unidad_codigo: limpio(f['CodigoUnidad'], 20),
        unidad: limpio(f['NombreUnidad']),
        rut_unidad: limpio(f['RutUnidad'], 20),
        comuna: limpio(f['ComunaUnidad'], 80),
        region: limpio(f['RegionUnidad'], 80),
        fecha_publicacion: fecha(f['FechaPublicacion']),
        fecha_cierre: fecha(f['FechaCierre']),
        fecha_adjudicacion: fecha(f['FechaAdjudicacion']),
        moneda: limpio(f['CodigoMoneda'], 10),
        monto_estimado: numero(f['MontoEstimado']),
        monto_adjudicado: null,
        oferentes: numero(f['NumeroOferentes']),
        lineas: 0,
        rubros: [],
        del_rubro: nombreDelRubro(f['Nombre']),
      };
      licitaciones.set(codigo, l);
      lineas.set(codigo, new Set());
      rubros.set(codigo, new Set());
    }
    const linea = llave(f['Correlativo']);
    lineas.get(codigo)!.add(linea);
    const rubro = limpio(f['Rubro2'], 120);
    if (rubro) rubros.get(codigo)!.add(rubro);
    if (!l.del_rubro && codigoDelRubro(f['CodigoProductoONU'])) {
      l.del_rubro = true;
    }

    const rut = limpio(f['RutProveedor'], 20);
    if (!rut) continue;
    const enPesos = esPeso(f['Moneda de la Oferta']);
    const ganada = /^seleccionada$/i.test(
      (f['Oferta seleccionada'] ?? '').trim(),
    );
    const adjudicado = ganada && enPesos ? montoDeLaLinea(f) : null;
    if (adjudicado !== null)
      l.monto_adjudicado = suma(l.monto_adjudicado, adjudicado);

    const clave = `${codigo}|${rut}`;
    let o = ofertas.get(clave);
    if (!o) {
      o = {
        codigo,
        rut,
        proveedor:
          limpio(f['NombreProveedor']) ?? limpio(f['RazonSocialProveedor']),
        moneda: limpio(f['Moneda de la Oferta'], 30),
        monto_ofertado: null,
        monto_adjudicado: null,
        lineas_ofertadas: 0,
        lineas_ganadas: 0,
        gano: false,
      };
      ofertas.set(clave, o);
      lineasDeLaOferta.set(clave, new Set());
    }
    const lineasOfertadas = lineasDeLaOferta.get(clave)!;
    if (!lineasOfertadas.has(linea)) {
      lineasOfertadas.add(linea);
      o.lineas_ofertadas++;
      if (enPesos)
        o.monto_ofertado = suma(
          o.monto_ofertado,
          numero(f['Valor Total Ofertado']),
        );
    }
    if (ganada) {
      o.lineas_ganadas++;
      o.gano = true;
      o.monto_adjudicado = suma(o.monto_adjudicado, adjudicado);
    }
  }
  for (const [codigo, l] of licitaciones) {
    l.lineas = lineas.get(codigo)!.size;
    l.rubros = [...rubros.get(codigo)!].slice(0, 5);
  }
  return {
    licitaciones: [...licitaciones.values()],
    ofertas: [...ofertas.values()],
    filas: total,
  };
}
