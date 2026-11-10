import { trabajarEnElTaller } from '../generacion/taller';
import { armar, CUENTA, entorno, planDe } from './generacion-de-prueba';

// EL PRECIO POR ÍTEM EN LOS FORMULARIOS (decisión 119, 07-11). Felipe: "el
// precio debería armarse desde lo que coloco yo para postular y de ahí
// completarse a los formularios... en caso que sí lo pidan, los precios se
// reparten con algún criterio y que la suma calce perfecto". El reparto lo
// calcula «Armar postulación» (el-reparto.ts) y la IA lo copia tal cual.
// El taller va de mentira.

jest.mock('../generacion/taller', () => ({
  ...jest.requireActual<object>('../generacion/taller'),
  trabajarEnElTaller: jest.fn(),
}));
const taller = trabajarEnElTaller as jest.Mock;
beforeEach(() => taller.mockReset());

/** $480.000 sobre un salón y un almuerzo para 20, con IVA y en neto. */
const REPARTO = [
  {
    titulo: 'Miércoles 11 de noviembre de 2026',
    subtotal: 480_000,
    lineas: [
      {
        servicio: 'Salón auditorio',
        detalle: '',
        cantidad: '1',
        unidades: 1,
        unitario: 240_000,
        total: 240_000,
        unitarioNeto: 201_681,
        totalNeto: 201_681,
      },
      {
        servicio: 'Almuerzo',
        detalle: 'Carne mechada',
        cantidad: '20 personas',
        unidades: 20,
        unitario: 12_000,
        total: 240_000,
        unitarioNeto: 10_084,
        totalNeto: 201_680,
      },
    ],
  },
];

describe('El precio por ítem en los formularios', () => {
  it('con el precio repartido sobre la cotización, los formularios lo llevan por ítem, con IVA y en neto, y queda guardado', () =>
    entorno(async () => {
      const { repo, servicio, ejecutar } = armar();
      await servicio.generarAnexos(1, CUENTA, 40, {
        monto_total: 480_000,
        post_venta: [],
        reparto: REPARTO,
      });
      const sistema = planDe(ejecutar).sistema;
      expect(sistema).toContain('usa EL PRECIO POR ÍTEM (abajo) tal cual');
      expect(sistema).toContain(
        '- Almuerzo (Carne mechada): 20 personas × $12.000 = $240.000 con IVA; en neto, 20 personas × $10.084 = $201.680.',
      );
      expect(sistema).toContain('Suman $480.000 con IVA y $403.361 en neto.');
      expect(sistema).not.toContain('Si pide un desglose que no está aquí');
      expect(repo.crearGeneracion).toHaveBeenCalledWith(
        expect.objectContaining({
          parametros: expect.objectContaining({ reparto: REPARTO }),
        }),
      );
    }));

  it('al reintentar («Reintentar» manda solo el precio), el de la vez anterior; con otro precio no, y el precio por ítem queda pendiente como antes', () =>
    entorno(async () => {
      const { repo, servicio, ejecutar } = armar();
      repo.ultimoDeTipo.mockResolvedValue({
        parametros: { monto_total: 480_000, reparto: REPARTO },
      });
      await servicio.generarAnexos(1, CUENTA, 40, { monto_total: 480_000 });
      expect(planDe(ejecutar).sistema).toContain('EL PRECIO POR ÍTEM');
      ejecutar.mockClear();
      await servicio.generarAnexos(1, CUENTA, 40, { monto_total: 500_000 });
      expect(planDe(ejecutar).sistema).not.toContain('EL PRECIO POR ÍTEM');
      expect(planDe(ejecutar).sistema).toContain(
        'Si pide un desglose que no está aquí',
      );
    }));
});
