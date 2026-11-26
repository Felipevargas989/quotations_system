import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { comprasAgilesDelMes } from '../datos-abiertos/compras-agiles-del-mes';
import type { FilaDelCsv } from '../datos-abiertos/csv';
import { licitacionesDelMes } from '../datos-abiertos/licitaciones-del-mes';
import { filaDeCompraAgil, filaDeLicitacion } from './datos-abiertos-de-prueba';

// LA HUELLA DEL MERCADO (25-11-2026). El código ONU de cada línea queda
// guardado por fila para que el motor sirva a empresas de cualquier rubro.
// La condición de Felipe: para Eventia NADA cambia en lo que se marca ni en
// lo que se guarda, salvo la columna nueva `onu`. Esta prueba guarda en
// `huellas/` lo que devolvían los lectores del mes ANTES del cambio y
// compara todo menos `onu`. Para rehacerla a propósito:
// ACTUALIZAR_HUELLA=1 npx jest huella-del-mercado

const ARCHIVO = join(__dirname, 'huellas', 'mercado-del-mes.json');

async function* deLista(filas: FilaDelCsv[]) {
  for (const f of filas) {
    await Promise.resolve();
    yield f;
  }
}

const OTRO = {
  RutProveedor: '77.222.222-2',
  NombreProveedor: 'LA COMPETENCIA',
  'Oferta seleccionada': 'No Seleccionada',
  CantidadAdjudicada: '0',
};

/** Licitaciones de todo tipo: del rubro por código, por nombre, por los
 *  dos, fuera del rubro, desierta, en dólares y con la cantidad inflada. */
const LICITACIONES: FilaDelCsv[] = [
  filaDeLicitacion(),
  filaDeLicitacion({
    Correlativo: '2',
    CodigoProductoONU: '90111501',
    MontoUnitarioOferta: '100000',
    'Cantidad Ofertada': '1',
    CantidadAdjudicada: '1',
    'Valor Total Ofertado': '100000',
  }),
  filaDeLicitacion({ ...OTRO, 'Valor Total Ofertado': '15000000' }),
  filaDeLicitacion({
    CodigoExterno: '3784-128-LE25',
    MontoUnitarioOferta: '62213,2',
    'Cantidad Ofertada': '200',
    CantidadAdjudicada: '12442640',
    'Valor Total Ofertado': '12442640',
  }),
  filaDeLicitacion({
    CodigoExterno: '2408-269-LE25',
    Nombre: 'SERVICIO INTEGRAL PARA ACTIVIDAD ANUAL',
    Estado: 'Desierta (o art. 3 ó 9 Ley 19.886)',
    CodigoProductoONU: '80141607',
    RutProveedor: '',
  }),
  // Del rubro solo por el código de su segunda línea.
  filaDeLicitacion({
    CodigoExterno: '1000-1-LP25',
    Nombre: 'ADQUISICIÓN DE INSUMOS VARIOS',
    CodigoProductoONU: '43211507',
    Rubro2: 'EQUIPOS INFORMÁTICOS',
  }),
  filaDeLicitacion({
    CodigoExterno: '1000-1-LP25',
    Nombre: 'ADQUISICIÓN DE INSUMOS VARIOS',
    Correlativo: '2',
    CodigoProductoONU: '93131608',
    Rubro2: 'ALIMENTOS',
  }),
  // Del rubro solo por el nombre.
  filaDeLicitacion({
    CodigoExterno: '2000-2-L125',
    Nombre: 'Celebración aniversario comunal',
    CodigoProductoONU: '49101704',
    Rubro2: 'GALVANOS',
    'Moneda de la Oferta': 'Dolar',
  }),
  // Fuera del rubro, con el mismo código en dos líneas y uno vacío.
  filaDeLicitacion({
    CodigoExterno: '3000-3-LE25',
    Nombre: 'Suministro de ventanas',
    CodigoProductoONU: '30171604',
    Rubro2: 'CONSTRUCCIÓN',
  }),
  filaDeLicitacion({
    CodigoExterno: '3000-3-LE25',
    Nombre: 'Suministro de ventanas',
    Correlativo: '2',
    CodigoProductoONU: '30171604',
    Rubro2: 'CONSTRUCCIÓN',
  }),
  filaDeLicitacion({
    CodigoExterno: '3000-3-LE25',
    Nombre: 'Suministro de ventanas',
    Correlativo: '3',
    CodigoProductoONU: '',
    Rubro2: 'CONSTRUCCIÓN',
    ...OTRO,
  }),
];

const OTRA_COTIZACION = {
  RUTProveedor: '77.222.222-2',
  RazonSocialProveedor: 'LA COMPETENCIA',
  ProveedorSeleccionado: 'no',
};

/** Compras ágiles: del rubro por nombre, por código, fuera del rubro, en
 *  otra moneda y del archivo antiguo sin NombreOOPP. */
const antigua = filaDeCompraAgil({
  CodigoCotizacion: '3497-490-COT26',
  RazonSocialUnidaddeCompra: 'I MUNICIPALIDAD DE COBQUECURA',
  moneda: 'USD',
});
delete antigua['NombreOOPP'];

const COMPRAS_AGILES: FilaDelCsv[] = [
  filaDeCompraAgil(),
  filaDeCompraAgil({
    CodigoProducto: '90111501',
    NombreProductoGenerico: 'Arriendo de salón',
  }),
  filaDeCompraAgil({ ...OTRA_COTIZACION, MontoTotal: '6100000' }),
  filaDeCompraAgil({
    ...OTRA_COTIZACION,
    MontoTotal: '5900000',
    CodigoProducto: '90111501',
    NombreProductoGenerico: 'Arriendo de salón',
  }),
  filaDeCompraAgil({
    CodigoCotizacion: '3497-470-COT26',
    NombreCotizacion: 'ADQUISICIÓN PARA ACTIVIDAD DE FIN DE AÑO',
    CodigoProducto: '43211507',
    NombreProductoGenerico: 'Computadores',
    ProveedorSeleccionado: 'no',
    Estado: 'Cerrada',
  }),
  filaDeCompraAgil({
    CodigoCotizacion: '3497-470-COT26',
    NombreCotizacion: 'ADQUISICIÓN PARA ACTIVIDAD DE FIN DE AÑO',
    CodigoProducto: '90111501',
    ProveedorSeleccionado: 'no',
    Estado: 'Cerrada',
  }),
  filaDeCompraAgil({
    CodigoCotizacion: '3497-480-COT26',
    NombreCotizacion: 'RESMAS DE PAPEL',
    CodigoProducto: '14111507',
    NombreProductoGenerico: 'Papel para impresora',
    MontoTotal: '300000',
  }),
  filaDeCompraAgil({
    CodigoUnidaddeCompra: '5000',
    RUTUnidaddeCompra: '61.000.000-0',
    NombreUnidaddeCompra: 'Hospital de Chillán',
    CodigoCotizacion: '5000-10-COT26',
    NombreCotizacion: 'Almuerzo jornada de capacitación',
    CodigoProducto: '50192100',
    NombreProductoGenerico: 'Colaciones',
  }),
  antigua,
];

/** Lo que devuelven los lectores, sin el campo `onu` (lo único nuevo). */
const sinOnu = (valor: unknown): unknown =>
  JSON.parse(
    JSON.stringify(valor, (clave, v: unknown) =>
      clave === 'onu' ? undefined : v,
    ),
  );

async function huellaDeHoy() {
  return sinOnu({
    licitaciones: await licitacionesDelMes(deLista(LICITACIONES), '2025-10-01'),
    comprasAgiles: await comprasAgilesDelMes(
      () => deLista(COMPRAS_AGILES),
      '2026-10-01',
    ),
  });
}

describe('La huella del mercado: para Eventia nada cambia salvo `onu`', () => {
  it('los lectores del mes devuelven lo mismo que antes del ONU por fila', async () => {
    const hoy = await huellaDeHoy();
    if (process.env.ACTUALIZAR_HUELLA === '1') {
      mkdirSync(dirname(ARCHIVO), { recursive: true });
      writeFileSync(ARCHIVO, `${JSON.stringify(hoy, null, 2)}\n`);
    }
    expect(existsSync(ARCHIVO)).toBe(true);
    const guardada: unknown = JSON.parse(readFileSync(ARCHIVO, 'utf8'));
    expect(hoy).toEqual(guardada);
  });
});
