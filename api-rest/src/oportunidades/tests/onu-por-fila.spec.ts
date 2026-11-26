import type { SupabaseService } from 'src/supabase/supabase.service';
import { comprasAgilesDelMes } from '../datos-abiertos/compras-agiles-del-mes';
import type { FilaDelCsv } from '../datos-abiertos/csv';
import {
  codigoDelRubro,
  nombreDelRubro,
  prefijosOnu,
  REGLAS_DE_EVENTOS,
  type ReglasDelRubro,
} from '../datos-abiertos/datos-abiertos';
import { DatosAbiertosRepository } from '../datos-abiertos/datos-abiertos.repository';
import { licitacionesDelMes } from '../datos-abiertos/licitaciones-del-mes';
import { filaDeCompraAgil, filaDeLicitacion } from './datos-abiertos-de-prueba';

// EL ONU POR FILA (25-11-2026). El motor se instalará para empresas de
// cualquier rubro: el código ONU de cada línea queda guardado por proceso,
// con sus prefijos, y las reglas del rubro pasan a ser un parámetro. Para
// Eventia la marca sigue igual (lo fija también huella-del-mercado.spec.ts).

async function* deLista(filas: FilaDelCsv[]) {
  for (const f of filas) {
    await Promise.resolve();
    yield f;
  }
}

describe('Los códigos ONU con sus prefijos', () => {
  it('cada código va con sus prefijos de 4, 6 y 8 dígitos, ordenados', () => {
    expect(prefijosOnu(['90101603'])).toEqual(['9010', '901016', '90101603']);
    expect(prefijosOnu(['80141607', '43211507'])).toEqual([
      '4321',
      '432115',
      '43211507',
      '8014',
      '801416',
      '80141607',
    ]);
  });

  it('sin repetidos: dos códigos de la misma familia comparten sus prefijos', () => {
    expect(prefijosOnu(['90101603', '90101601', '90101603'])).toEqual([
      '9010',
      '901016',
      '90101601',
      '90101603',
    ]);
  });

  it('lo que no es un código ONU no entra', () => {
    expect(prefijosOnu(['', '  ', 'NA', '901', 'abc12345'])).toEqual([]);
    expect(prefijosOnu([' 90111501 '])).toEqual(['9011', '901115', '90111501']);
  });

  it('las reglas de eventos calzan con los prefijos tal como lo hace `startsWith`', () => {
    // Lo que el operador `&&` de la base va a comparar.
    for (const codigo of ['90101603', '90111501', '80141607', '43211507']) {
      const calza = prefijosOnu([codigo]).some((p) =>
        REGLAS_DE_EVENTOS.prefijosOnu.includes(p),
      );
      expect(calza).toBe(codigoDelRubro(codigo));
    }
  });
});

describe('Las licitaciones de un mes guardan su ONU', () => {
  it('junta los códigos de todas sus líneas y ofertas, sin repetidos', async () => {
    const r = await licitacionesDelMes(
      deLista([
        filaDeLicitacion(),
        filaDeLicitacion({ RutProveedor: '77.222.222-2' }),
        filaDeLicitacion({ Correlativo: '2', CodigoProductoONU: '90111501' }),
        filaDeLicitacion({ Correlativo: '3', CodigoProductoONU: '' }),
        // Una desierta, sin ofertas, igual guarda su ONU.
        filaDeLicitacion({
          CodigoExterno: '2408-269-LE25',
          CodigoProductoONU: '80141607',
          RutProveedor: '',
        }),
      ]),
      '2025-10-01',
    );
    expect(r.licitaciones.map((l) => [l.codigo, l.onu])).toEqual([
      [
        '4352-6-LE25',
        ['9010', '901016', '90101603', '9011', '901115', '90111501'],
      ],
      ['2408-269-LE25', ['8014', '801416', '80141607']],
    ]);
  });

  it('la marca de eventos sigue igual, y fuera del rubro también guarda su ONU', async () => {
    const r = await licitacionesDelMes(
      deLista([
        filaDeLicitacion({
          CodigoExterno: '3000-3-LE25',
          Nombre: 'Suministro de ventanas',
          CodigoProductoONU: '30171604',
        }),
      ]),
      '2025-10-01',
    );
    expect(r.licitaciones[0]).toMatchObject({
      del_rubro: false,
      onu: ['3017', '301716', '30171604'],
    });
  });

  it('con otras reglas, la marca sale de esas reglas', async () => {
    const ventanas: ReglasDelRubro = {
      prefijosOnu: ['3017'],
      nombre: /ventana/i,
    };
    const filas = () =>
      deLista([
        filaDeLicitacion(),
        filaDeLicitacion({
          CodigoExterno: '3000-3-LE25',
          Nombre: 'Obras menores',
          CodigoProductoONU: '30171604',
        }),
      ]);
    const r = await licitacionesDelMes(filas(), '2025-10-01', ventanas);
    expect(r.licitaciones.map((l) => l.del_rubro)).toEqual([false, true]);
    expect(nombreDelRubro('Suministro de ventanas', ventanas)).toBe(true);
    expect(codigoDelRubro('90101603', ventanas)).toBe(false);
  });
});

describe('Las compras ágiles de un mes guardan su ONU', () => {
  it('junta los códigos de todos sus productos y cotizaciones, sin repetidos', async () => {
    const r = await comprasAgilesDelMes(
      () =>
        deLista([
          filaDeCompraAgil(),
          filaDeCompraAgil({ CodigoProducto: '90111501' }),
          filaDeCompraAgil({
            RUTProveedor: '77.222.222-2',
            ProveedorSeleccionado: 'no',
          }),
          // Fuera del rubro: no se guarda en detalle, ni su ONU.
          filaDeCompraAgil({
            CodigoCotizacion: '3497-480-COT26',
            NombreCotizacion: 'RESMAS DE PAPEL',
            CodigoProducto: '14111507',
          }),
        ]),
      '2026-10-01',
    );
    expect(r.solicitudes.map((s) => [s.codigo, s.onu])).toEqual([
      [
        '3497-466-COT26',
        ['9010', '901016', '90101603', '9011', '901115', '90111501'],
      ],
    ]);
  });

  it('del rubro por el código de un producto, guarda también el código que no es del rubro', async () => {
    const r = await comprasAgilesDelMes(
      () =>
        deLista([
          filaDeCompraAgil({
            NombreCotizacion: 'ADQUISICIÓN VARIA',
            CodigoProducto: '43211507',
          }),
          filaDeCompraAgil({
            NombreCotizacion: 'ADQUISICIÓN VARIA',
            CodigoProducto: '90111501',
          }),
        ]),
      '2026-10-01',
    );
    expect(r.solicitudes[0].onu).toEqual([
      '4321',
      '432115',
      '43211507',
      '9011',
      '901115',
      '90111501',
    ]);
    expect(r.totales[0].solicitudes_rubro).toBe(1);
  });
});

describe('El repositorio manda el ONU a la base', () => {
  function armar() {
    const escrito: Array<{ tabla: string; filas: object[] }> = [];
    const respuesta = Promise.resolve({ error: null });
    const from = jest.fn((tabla: string) => ({
      upsert: (filas: object[]) => {
        escrito.push({ tabla, filas });
        return respuesta;
      },
      insert: (filas: object[]) => {
        escrito.push({ tabla, filas });
        return respuesta;
      },
      delete: () => ({ in: () => respuesta, eq: () => respuesta }),
    }));
    const repo = new DatosAbiertosRepository({
      client: { from },
    } as unknown as SupabaseService);
    return { repo, escrito };
  }

  it('cada licitación va a `mercado_licitaciones` con su `onu`', async () => {
    const { repo, escrito } = armar();
    const mes = await licitacionesDelMes(
      deLista([filaDeLicitacion()]),
      '2025-10-01',
    );
    await repo.guardarLicitaciones(mes);
    const licitaciones = escrito.find(
      (e) => e.tabla === 'mercado_licitaciones',
    );
    expect(licitaciones?.filas).toEqual([
      expect.objectContaining({
        codigo: '4352-6-LE25',
        onu: ['9010', '901016', '90101603'],
      }),
    ]);
  });

  it('cada compra ágil va a `mercado_compras_agiles` con su `onu`', async () => {
    const { repo, escrito } = armar();
    const mes = await comprasAgilesDelMes(
      () => deLista([filaDeCompraAgil()]),
      '2026-10-01',
    );
    await repo.guardarComprasAgiles('2026-10-01', mes);
    const solicitudes = escrito.find(
      (e) => e.tabla === 'mercado_compras_agiles',
    );
    expect(solicitudes?.filas).toEqual([
      expect.objectContaining({
        codigo: '3497-466-COT26',
        onu: ['9010', '901016', '90101603'],
      }),
    ]);
  });
});
