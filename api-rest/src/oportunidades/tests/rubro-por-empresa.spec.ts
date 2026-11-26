import { comprasAgilesDelMes } from '../datos-abiertos/compras-agiles-del-mes';
import type { FilaDelCsv } from '../datos-abiertos/csv';
import {
  type CatalogoOnu,
  codigoDelRubro,
  nombreDelRubro,
  prefijosOnu,
} from '../datos-abiertos/datos-abiertos';
import { licitacionesDelMes } from '../datos-abiertos/licitaciones-del-mes';
import {
  calzaConPalabras,
  esDeLaEmpresa,
  expresionDePalabras,
  FAMILIA_VALIDA,
  huellaDelPerfil,
  menuDeFamilias,
  propuestaValida,
  reglasDeLaUnion,
  rubroLimpio,
  textoDelMenu,
  textoNormal,
  tieneReglas,
} from '../rubro/rubro-de-la-empresa';
import { filaDeCompraAgil, filaDeLicitacion } from './datos-abiertos-de-prueba';

// EL RUBRO DE CADA EMPRESA (Licita, 25-11): las reglas puras, el catálogo
// ONU que llenan los lectores del mes y la unión de reglas con que se
// guardan las compras ágiles en una instalación «general».

async function* deLista(filas: FilaDelCsv[]) {
  for (const f of filas) {
    await Promise.resolve();
    yield f;
  }
}

/** `mercado_texto` de la migración, escrito tal cual en TypeScript: translate
 *  de las tildes, lower, todo lo que no es [a-z0-9] a un espacio, btrim y un
 *  espacio a cada lado. Sirve para comparar con `textoNormal`. */
const mercadoTextoDeLaBase = (texto: string): string => {
  const de = 'ÁÉÍÓÚÜÑáéíóúüñ';
  const a = 'AEIOUUNaeiouun';
  const traducido = [...texto]
    .map((c) => (de.includes(c) ? a[de.indexOf(c)] : c))
    .join('');
  return ` ${traducido
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^ +| +$/g, '')} `;
};

const NOMBRES = [
  'SERVICIO DE ASEO INDUSTRIAL HOSPITAL REGIONAL',
  'Paseo de fin de año funcionarios',
  'Banquetería para ceremonia',
  'ADQUISICIÓN DE CAFÉ Y TÉ',
  'Limpieza de vidrios en altura',
  'Aseo-Industrial (2 meses)',
  'Arriendo de salón y cóctel',
  'Mantención de jardines y áreas verdes',
  'NIÑOS: útiles escolares',
  'Desratización y control de plagas',
];

describe('el rubro de una empresa: cómo calza una compra', () => {
  it('normaliza igual que la base (mercado_texto)', () => {
    for (const n of NOMBRES) {
      expect(` ${textoNormal(n)} `).toBe(mercadoTextoDeLaBase(n));
    }
    expect(textoNormal('Día del Funcionario ÑUBLE')).toBe(
      'dia del funcionario nuble',
    );
  });

  it('una palabra calza al comienzo de una palabra del nombre, sin tildes ni mayúsculas', () => {
    expect(calzaConPalabras(NOMBRES[0], ['aseo'])).toBe(true);
    expect(calzaConPalabras(NOMBRES[1], ['aseo'])).toBe(false); // «paseo»
    expect(calzaConPalabras(NOMBRES[2], ['banquet'])).toBe(true);
    expect(calzaConPalabras(NOMBRES[3], ['cafe'])).toBe(true);
    expect(calzaConPalabras(NOMBRES[5], ['aseo industrial'])).toBe(true);
    expect(calzaConPalabras(NOMBRES[8], ['nino'])).toBe(true);
    expect(calzaConPalabras(NOMBRES[0], ['', '  '])).toBe(false);
  });

  it('es de la empresa por código o por nombre, y las exclusiones mandan', () => {
    const aseo = rubroLimpio({
      onu_familias: ['7611'],
      palabras: ['aseo', 'limpiez'],
      palabras_no: ['plaga'],
    });
    expect(esDeLaEmpresa({ nombre: NOMBRES[4], onu: [] }, aseo)).toBe(true);
    expect(
      esDeLaEmpresa(
        { nombre: 'Servicio integral', onu: prefijosOnu(['76111501']) },
        aseo,
      ),
    ).toBe(true);
    expect(esDeLaEmpresa({ nombre: NOMBRES[9], onu: ['7611'] }, aseo)).toBe(
      false,
    );
    expect(esDeLaEmpresa({ nombre: NOMBRES[1], onu: [] }, aseo)).toBe(false);
  });

  it('lo que se guarda: familias de 4, 6 u 8 dígitos sin repetir y palabras normalizadas', () => {
    expect(
      rubroLimpio({
        onu_familias: ['7611', '761115', '76111501', '761', '7611', 'abcd'],
        palabras: ['  Limpiéza ', 'limpieza', ''],
        palabras_no: null,
      }),
    ).toEqual({
      onu_familias: ['7611', '761115', '76111501'],
      palabras: ['limpieza'],
      palabras_no: [],
    });
    expect(FAMILIA_VALIDA.test('76111')).toBe(false);
    expect(tieneReglas(rubroLimpio({ palabras_no: ['x'] }))).toBe(false);
  });

  it('la huella del perfil cambia con el texto y no con los bordes', () => {
    expect(huellaDelPerfil('Aseo industrial')).toBe(
      huellaDelPerfil('  Aseo industrial\n'),
    );
    expect(huellaDelPerfil('Aseo industrial')).not.toBe(
      huellaDelPerfil('Aseo de oficinas'),
    );
    expect(huellaDelPerfil('   ')).toBeNull();
  });
});

describe('la unión de las reglas (qué compras ágiles se guardan en «general»)', () => {
  it('junta familias y palabras de todas las empresas, sin las exclusiones', () => {
    const { reglas } = reglasDeLaUnion([
      { onu_familias: ['7611'], palabras: ['aseo'], palabras_no: ['plaga'] },
      { onu_familias: ['9010', '7611'], palabras: ['banquet'] },
    ]);
    expect(reglas.prefijosOnu).toEqual(['7611', '9010']);
    expect(codigoDelRubro('90101603', reglas)).toBe(true);
    expect(nombreDelRubro(NOMBRES[9], reglas)).toBe(false);
    expect(nombreDelRubro('Aseo y control de plagas', reglas)).toBe(true);
  });

  it('la expresión del nombre reconoce exactamente lo mismo que la base', () => {
    const palabras = ['aseo', 'cafe', 'banquet', 'aseo industrial', 'nino'];
    const expresion = expresionDePalabras(palabras);
    for (const n of [...NOMBRES, 'ASEO', 'el aseo', 'xaseo', 'Café']) {
      expect([n, expresion.test(n)]).toEqual([
        n,
        calzaConPalabras(n, palabras),
      ]);
    }
  });

  it('la huella no depende del orden y cambia si cambian las reglas; sin reglas no guarda nada', () => {
    const a = reglasDeLaUnion([
      { onu_familias: ['7611'], palabras: ['aseo'] },
      { onu_familias: ['9010'], palabras: [] },
    ]);
    const b = reglasDeLaUnion([
      { onu_familias: ['9010'] },
      { palabras: ['Aseo'], onu_familias: ['7611'] },
    ]);
    expect(a.huella).toBe(b.huella);
    expect(reglasDeLaUnion([{ onu_familias: ['7611'] }]).huella).not.toBe(
      a.huella,
    );
    const vacia = reglasDeLaUnion([]);
    expect(vacia.reglas.prefijosOnu).toEqual([]);
    expect(nombreDelRubro('DIA DEL FUNCIONARIO', vacia.reglas)).toBe(false);
  });
});

describe('el menú cerrado de familias para la IA', () => {
  const catalogo = [
    { codigo: '90101603', nombre: 'Servicios de catering', veces: 50 },
    { codigo: '90101601', nombre: 'Banquetes', veces: 20 },
    { codigo: '90111501', nombre: 'Hoteles', veces: 5 },
    { codigo: '76111501', nombre: 'Servicios de aseo', veces: 40 },
    {
      codigo: '7611',
      nombre: 'código corto, no es de los archivos',
      veces: 99,
    },
  ];

  it('agrupa por familia y clase con los productos más vistos de ejemplo', () => {
    const menu = menuDeFamilias(catalogo);
    expect(menu.map((f) => f.codigo)).toEqual([
      '7611',
      '761115',
      '9010',
      '901016',
      '9011',
      '901115',
    ]);
    expect(menu.find((f) => f.codigo === '901016')?.ejemplos).toEqual([
      'Servicios de catering',
      'Banquetes',
    ]);
    expect(textoDelMenu(menu)).toContain('9010 (familia entera)');
    // Con tope, entran las clases más vistas y sus familias.
    expect(menuDeFamilias(catalogo, 1).map((f) => f.codigo)).toEqual([
      '9010',
      '901016',
    ]);
  });

  it('de la propuesta de la IA solo quedan códigos del menú', () => {
    const menu = menuDeFamilias(catalogo);
    expect(
      propuestaValida(
        {
          onu_familias: ['9010', '43211507', '761115', '1234'],
          palabras: ['Catering'],
          palabras_no: [],
        },
        menu,
      ),
    ).toEqual({
      onu_familias: ['761115', '9010'],
      palabras: ['catering'],
      palabras_no: [],
    });
  });
});

describe('el catálogo ONU que llenan los lectores del mes (solo si se les pasa)', () => {
  it('las licitaciones anotan cada producto con su «Nombre producto genrico» y en cuántos procesos salió; lo que devuelven no cambia', async () => {
    const filas = [
      filaDeLicitacion({ 'Nombre producto genrico': 'Servicios de catering' }),
      filaDeLicitacion({
        Correlativo: '2',
        RutProveedor: '77.222.222-2',
        'Nombre producto genrico': 'Servicios de catering',
      }),
      filaDeLicitacion({
        CodigoExterno: '1-1-LE25',
        CodigoProductoONU: '76111501',
        'Nombre producto genrico': 'Servicios de aseo',
      }),
      filaDeLicitacion({
        CodigoExterno: '2-2-LE25',
        'Nombre producto genrico': 'Servicios de catering',
      }),
    ];
    const catalogo: CatalogoOnu = new Map();
    const con = await licitacionesDelMes(
      deLista(filas),
      '2025-10-01',
      undefined,
      catalogo,
    );
    const sin = await licitacionesDelMes(deLista(filas), '2025-10-01');
    expect(con).toEqual(sin);
    expect(catalogo.get('90101603')).toMatchObject({
      nombre: 'Servicios de catering',
      veces: 2,
    });
    expect(catalogo.get('76111501')).toMatchObject({
      nombre: 'Servicios de aseo',
      veces: 1,
    });
  });

  it('las compras ágiles anotan los productos de TODAS (también las que no se guardan en detalle)', async () => {
    const filas = [
      filaDeCompraAgil(),
      filaDeCompraAgil({
        CodigoCotizacion: '3497-480-COT26',
        NombreCotizacion: 'RESMAS DE PAPEL',
        CodigoProducto: '14111507',
        NombreProductoGenerico: 'Papel para impresora',
      }),
    ];
    const catalogo: CatalogoOnu = new Map();
    const con = await comprasAgilesDelMes(
      () => deLista(filas),
      '2026-10-01',
      undefined,
      catalogo,
    );
    expect(con).toEqual(
      await comprasAgilesDelMes(() => deLista(filas), '2026-10-01'),
    );
    expect(con.solicitudes.map((s) => s.codigo)).toEqual(['3497-466-COT26']);
    expect(catalogo.get('14111507')).toMatchObject({
      nombre: 'Papel para impresora',
      veces: 1,
    });
  });

  it('con la unión de reglas de las empresas, se guarda en detalle lo que busca alguna', async () => {
    const filas = [
      filaDeCompraAgil(),
      filaDeCompraAgil({
        CodigoCotizacion: '3497-480-COT26',
        NombreCotizacion: 'RESMAS DE PAPEL',
        CodigoProducto: '14111507',
      }),
    ];
    const { reglas } = reglasDeLaUnion([{ palabras: ['resma'] }]);
    const del = await comprasAgilesDelMes(
      () => deLista(filas),
      '2026-10-01',
      reglas,
    );
    expect(del.solicitudes.map((s) => s.codigo)).toEqual(['3497-480-COT26']);
    expect(del.totales[0]).toMatchObject({
      solicitudes: 2,
      solicitudes_rubro: 1,
    });
  });
});
