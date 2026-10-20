import { trabajarEnElTaller } from '../generacion/taller';
import { armar, CUENTA, entorno, planDe } from './generacion-de-prueba';

// LOS DATOS DE LA EMPRESA QUE LEE LA IA DE LOS ANEXOS. La página web vive
// en Configuración de empresa (decisión 47, 19-10; Felipe: "página web
// debería traer la de Eventia o no?"): la misma de los correos y del
// formulario público. La de «Mi empresa» quedó de antes y solo sirve si
// Configuración no tiene.

jest.mock('../generacion/taller', () => ({
  ...jest.requireActual<object>('../generacion/taller'),
  trabajarEnElTaller: jest.fn(),
}));
beforeEach(() => (trabajarEnElTaller as jest.Mock).mockReset());

describe('Los datos de la empresa en los anexos', () => {
  it('la página web sale de Configuración, aunque «Mi empresa» tenga otra', () =>
    entorno(async () => {
      const { oferente, servicio, ejecutar } = armar();
      oferente.empresa.mockResolvedValue({
        name: 'Valle del Sol Quillón',
        logo_url: null,
        bank_details: null,
        sitio_web: 'www.valledelsolquillon.cl',
      });
      oferente.oferente.mockResolvedValue({
        razon_social: 'VALLE DEL SOL QUILLON SPA',
        rut: '77.701.305-K',
        sitio_web: 'www.vieja.cl',
      });
      await servicio.generarAnexos(1, CUENTA, 40, { monto_total: 11_900_000 });
      const sistema = planDe(ejecutar).sistema;
      expect(sistema).toContain('- Página web: www.valledelsolquillon.cl');
      expect(sistema).not.toContain('www.vieja.cl');
    }));

  it('si Configuración no tiene, usa la que quedó en «Mi empresa»; sin ninguna, no inventa una', () =>
    entorno(async () => {
      const { oferente, servicio, ejecutar } = armar();
      oferente.oferente.mockResolvedValue({
        razon_social: 'VALLE DEL SOL QUILLON SPA',
        rut: '77.701.305-K',
        sitio_web: 'www.antes.cl',
      });
      await servicio.generarAnexos(1, CUENTA, 40, { monto_total: 11_900_000 });
      expect(planDe(ejecutar).sistema).toContain('- Página web: www.antes.cl');

      ejecutar.mockClear();
      oferente.oferente.mockResolvedValue({
        razon_social: 'VALLE DEL SOL QUILLON SPA',
        rut: '77.701.305-K',
      });
      await servicio.generarAnexos(1, CUENTA, 40, { monto_total: 11_900_000 });
      expect(planDe(ejecutar).sistema).not.toContain('Página web');
    }));
});
