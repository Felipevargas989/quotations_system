import { deflateRawSync } from 'node:zlib';
import type { FilaDelCsv } from '../datos-abiertos/csv';

// Archivos como los de ChileCompra, pero chicos (decisión 101).

type ArchivoDelZip = { nombre: string; contenido: Buffer; guardado?: boolean };

const SIN_LUGAR = 0xffffffff;

/** Un ZIP armado a mano; con `zip64` usa los registros grandes. */
export function zipDePrueba(
  archivos: ArchivoDelZip[],
  { zip64 = false }: { zip64?: boolean } = {},
): Buffer {
  const partes: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const a of archivos) {
    const datos = a.guardado ? a.contenido : deflateRawSync(a.contenido);
    const nombre = Buffer.from(a.nombre, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(a.guardado ? 0 : 8, 8);
    local.writeUInt32LE(datos.length, 18);
    local.writeUInt32LE(a.contenido.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    const extra = Buffer.alloc(zip64 ? 28 : 0);
    if (zip64) {
      extra.writeUInt16LE(0x0001, 0);
      extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(a.contenido.length), 4);
      extra.writeBigUInt64LE(BigInt(datos.length), 12);
      extra.writeBigUInt64LE(BigInt(desplazamiento), 20);
    }
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(a.guardado ? 0 : 8, 10);
    central.writeUInt32LE(zip64 ? SIN_LUGAR : datos.length, 20);
    central.writeUInt32LE(zip64 ? SIN_LUGAR : a.contenido.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(zip64 ? SIN_LUGAR : desplazamiento, 42);
    centrales.push(Buffer.concat([central, nombre, extra]));
    partes.push(local, nombre, datos);
    desplazamiento += local.length + nombre.length + datos.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  if (!zip64) {
    fin.writeUInt16LE(archivos.length, 8);
    fin.writeUInt16LE(archivos.length, 10);
    fin.writeUInt32LE(directorio.length, 12);
    fin.writeUInt32LE(desplazamiento, 16);
    return Buffer.concat([...partes, directorio, fin]);
  }
  const fin64 = Buffer.alloc(56);
  fin64.writeUInt32LE(0x06064b50, 0);
  fin64.writeBigUInt64LE(44n, 4);
  fin64.writeBigUInt64LE(BigInt(archivos.length), 24);
  fin64.writeBigUInt64LE(BigInt(archivos.length), 32);
  fin64.writeBigUInt64LE(BigInt(directorio.length), 40);
  fin64.writeBigUInt64LE(BigInt(desplazamiento), 48);
  const localizador = Buffer.alloc(20);
  localizador.writeUInt32LE(0x07064b50, 0);
  localizador.writeBigUInt64LE(BigInt(desplazamiento + directorio.length), 8);
  localizador.writeUInt32LE(1, 16);
  fin.writeUInt16LE(0xffff, 8);
  fin.writeUInt16LE(0xffff, 10);
  fin.writeUInt32LE(SIN_LUGAR, 12);
  fin.writeUInt32LE(SIN_LUGAR, 16);
  return Buffer.concat([...partes, directorio, fin64, localizador, fin]);
}

/** Un CSV como los de ChileCompra: punto y coma, comillas, Windows-1252. */
export function csvDePrueba(filas: FilaDelCsv[]): Buffer {
  const columnas = Object.keys(filas[0] ?? {});
  const linea = (valores: string[]) =>
    valores.map((v) => `"${v.replace(/"/g, '""')}"`).join(';');
  const texto = [
    linea(columnas),
    ...filas.map((f) => linea(columnas.map((c) => f[c] ?? ''))),
  ].join('\r\n');
  return Buffer.from(`${texto}\r\n`, 'latin1');
}

/** Una línea de una oferta de licitación, con lo que se suele ver. */
export const filaDeLicitacion = (cambios: FilaDelCsv = {}): FilaDelCsv => ({
  CodigoExterno: '4352-6-LE25',
  Nombre: 'SERV. ALIMENTACIÓN CENA DÍA DEL FUNCIONARIO MUNIC.',
  Tipo: 'LE',
  Estado: 'Adjudicada',
  sector: 'Municipalidades',
  CodigoOrganismo: '7239',
  NombreOrganismo: 'I MUNICIPALIDAD DE QUILLON',
  CodigoUnidad: '4352',
  NombreUnidad: 'Municipalidad de Quillón',
  RutUnidad: '69.141.300-2',
  ComunaUnidad: 'Quillón',
  RegionUnidad: 'Región del Ñuble ',
  FechaPublicacion: '2025-10-02',
  FechaCierre: '2025-10-13',
  FechaAdjudicacion: '2025-10-20',
  CodigoMoneda: 'CLP',
  MontoEstimado: '1,7e+07',
  NumeroOferentes: '2',
  Correlativo: '1',
  Rubro2: 'RESTAURANTES Y CATERING',
  CodigoProductoONU: '90101603',
  RutProveedor: '76.111.111-1',
  NombreProveedor: 'VALLE DEL SOL',
  RazonSocialProveedor: 'VALLE DEL SOL SPA',
  'Moneda de la Oferta': 'Peso Chileno',
  'Oferta seleccionada': 'Seleccionada',
  MontoUnitarioOferta: '69747,9',
  'Cantidad Ofertada': '200',
  CantidadAdjudicada: '200',
  'Valor Total Ofertado': '13949580',
  ...cambios,
});

/** Una fila de una cotización de compra ágil (un producto). */
export const filaDeCompraAgil = (cambios: FilaDelCsv = {}): FilaDelCsv => ({
  NombreOOPP: 'I MUNICIPALIDAD DE COBQUECURA',
  NombreUnidaddeCompra: 'Municipalidad de Cobquecura',
  RUTUnidaddeCompra: '69.141.000-3',
  CodigoUnidaddeCompra: '3497',
  CodigoCotizacion: '3497-466-COT26',
  NombreCotizacion: 'DIA DEL FUNCIONARIO MUNICIPAL',
  Region: 'Región del Ñuble ',
  FechaPublicacionParaCotizar: '2026-10-21',
  FechaCierreParaCotizar: '2026-10-28',
  MontoTotalDisponble: '6e+06',
  CodigoProducto: '90101603',
  NombreProductoGenerico: 'Servicios de catering',
  Estado: 'Proveedor seleccionado',
  RazonSocialProveedor: 'VALLE DEL SOL SPA',
  RUTProveedor: '76.111.111-1',
  Tamano: 'MiPyme',
  ProveedorSeleccionado: 'si',
  moneda: 'CLP',
  MontoTotal: '5800000',
  NombreCriterio:
    'El proveedor cotizó todos los productos y su precio total fue el más bajo.',
  ...cambios,
});
