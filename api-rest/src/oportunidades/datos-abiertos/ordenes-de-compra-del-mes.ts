import type { FilaDelCsv } from './csv';
import {
  codigoDelRubro,
  fecha,
  limpio,
  codigo as llave,
  nombreDelRubro,
  numero,
  sinNA,
} from './datos-abiertos';

// LAS ÓRDENES DE COMPRA DE UN MES (decisión 108 del doc 17, el radar
// municipal). El archivo trae una fila por producto de cada orden de todo el
// Estado (410.373 filas y 147.627 órdenes en septiembre 2026); aquí quedan
// solo las de MUNICIPIOS, una por orden, con su modalidad y, si es trato
// directo, la causal que invocó el municipio. El organismo y el proveedor se
// guardan aparte, una vez cada uno.

export type Modalidad =
  | 'licitacion'
  | 'compra_agil'
  | 'convenio_marco'
  | 'trato_directo'
  | 'otra';

export type OrdenDeCompraDelMercado = {
  codigo: string;
  mes: string;
  fecha_envio: string | null;
  nombre: string | null;
  tipo: string | null;
  modalidad: Modalidad;
  causal: string | null;
  emergencia: boolean;
  estado: string | null;
  organismo_codigo: string | null;
  unidad_codigo: string | null;
  rut_proveedor: string | null;
  monto: number | null;
  codigo_licitacion: string | null;
  del_rubro: boolean;
};

export type OrganismoDelMercado = {
  codigo: string;
  nombre: string | null;
  sector: string | null;
  region: string | null;
  ciudad: string | null;
};

export type ProveedorDelMercado = {
  rut: string;
  nombre: string | null;
  actividad: string | null;
  comuna: string | null;
  region: string | null;
};

export type OrdenesDeCompraDelMes = {
  ordenes: OrdenDeCompraDelMercado[];
  organismos: OrganismoDelMercado[];
  proveedores: ProveedorDelMercado[];
  filas: number;
  todas: number;
};

const si = (texto: string | undefined) => /^s[ií]/i.test((texto ?? '').trim());

/** Las causales de trato directo que aparecen como procedencia (medido en
 *  septiembre 2026): emergencia, proveedor único, menos de 30 UTM, costo de
 *  evaluación desproporcionado, naturaleza de la negociación, licitación
 *  previa desierta, remanente de contrato... */
const CAUSAL_DE_TRATO_DIRECTO =
  /emergencia|urgencia|imprevist|proveedor|30 utm|costo de evaluaci|naturaleza de la negociaci|sin ofertas|inadmisibles|confianza y seguridad|propiedad intelectual|pr[oó]rroga|reposici[oó]n|remanente|conocimiento p[uú]blico|universidades estatales/i;

const EMERGENCIA = /emergencia|urgencia|imprevist/i;

/** Cómo se compró: lo dice el tipo de orden y, si no, su procedencia. */
export const modalidadDe = (f: FilaDelCsv): Modalidad => {
  const tipo = (f['Tipo'] ?? '').trim().toUpperCase();
  const procedencia = f['ProcedenciaOC'] ?? '';
  if (tipo === 'AG' || si(f['EsCompraAgil'])) return 'compra_agil';
  if (tipo === 'TD' || si(f['EsTratoDirecto'])) return 'trato_directo';
  if (tipo === 'CM' || /convenio marco/i.test(procedencia))
    return 'convenio_marco';
  if (/licitaci[oó]n (p[uú]blica|privada)/i.test(procedencia))
    return /sin ofertas|inadmisibles/i.test(procedencia)
      ? 'trato_directo'
      : 'licitacion';
  if (CAUSAL_DE_TRATO_DIRECTO.test(procedencia)) return 'trato_directo';
  return 'otra';
};

export async function ordenesDeCompraDelMes(
  filas: AsyncIterable<FilaDelCsv>,
  mes: string,
): Promise<OrdenesDeCompraDelMes> {
  const ordenes = new Map<string, OrdenDeCompraDelMercado>();
  const organismos = new Map<string, OrganismoDelMercado>();
  const proveedores = new Map<string, ProveedorDelMercado>();
  const todas = new Set<string>();
  let leidas = 0;
  for await (const f of filas) {
    leidas++;
    const codigo = (f['Codigo'] ?? '').trim();
    if (!codigo) continue;
    if (f['sector']?.trim() !== 'Municipalidades') {
      if (!todas.has(codigo)) todas.add(llave(codigo));
      continue;
    }
    let o = ordenes.get(codigo);
    if (!o) {
      todas.add(llave(codigo));
      const modalidad = modalidadDe(f);
      const procedencia = limpio(f['ProcedenciaOC'], 120);
      const organismo = limpio(f['CodigoOrganismoPublico'], 20);
      const rut = limpio(f['RutSucursal'], 20);
      o = {
        codigo: llave(codigo),
        mes,
        fecha_envio: fecha(f['FechaEnvio']),
        nombre: limpio(f['Nombre'], 150),
        tipo: limpio(f['Tipo'], 4),
        modalidad,
        causal: modalidad === 'trato_directo' ? sinNA(procedencia) : null,
        emergencia:
          modalidad === 'trato_directo' && EMERGENCIA.test(procedencia ?? ''),
        estado: limpio(f['Estado'], 40),
        organismo_codigo: organismo,
        unidad_codigo: limpio(f['CodigoUnidadCompra'], 20),
        rut_proveedor: rut,
        monto: (() => {
          const m = numero(f['MontoTotalOC_PesosChilenos']);
          return m === null ? null : Math.round(m);
        })(),
        codigo_licitacion: sinNA(limpio(f['CodigoLicitacion'], 30)),
        del_rubro: nombreDelRubro(f['Nombre']),
      };
      ordenes.set(codigo, o);
      if (organismo && !organismos.has(organismo)) {
        organismos.set(organismo, {
          codigo: organismo,
          nombre: limpio(f['OrganismoPublico'], 150),
          sector: limpio(f['sector'], 60),
          region: limpio(f['RegionUnidadCompra'], 80),
          ciudad: sinNA(limpio(f['CiudadUnidadCompra'], 80)),
        });
      }
      if (rut && !proveedores.has(rut)) {
        proveedores.set(rut, {
          rut,
          nombre: limpio(f['NombreProveedor'], 150),
          actividad: sinNA(limpio(f['ActividadProveedor'], 120)),
          comuna: sinNA(limpio(f['ComunaProveedor'], 80)),
          region: sinNA(limpio(f['RegionProveedor'], 80)),
        });
      }
    }
    if (!o.del_rubro && codigoDelRubro(f['codigoProductoONU'])) {
      o.del_rubro = true;
    }
  }
  return {
    ordenes: [...ordenes.values()],
    organismos: [...organismos.values()],
    proveedores: [...proveedores.values()],
    filas: leidas,
    todas: todas.size,
  };
}
