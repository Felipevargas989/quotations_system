import { trabajarEnElTaller } from '../generacion/taller';
import { armar, CUENTA, entorno, planDe } from './generacion-de-prueba';

// LA EXPERIENCIA QUE LEE LA IA DEL ANEXO (decisión 45, 19-10): un respaldo
// traído de Eventia dice de qué evento es, y ese evento no se repite en la
// lista de eventos: sería contar dos veces la misma experiencia. Aparte de
// generacion.service.spec, que llegó al tope de 800 líneas del portero.

jest.mock('../generacion/taller', () => ({
  ...jest.requireActual<object>('../generacion/taller'),
  trabajarEnElTaller: jest.fn(),
}));
beforeEach(() => (trabajarEnElTaller as jest.Mock).mockReset());

describe('La experiencia en los anexos', () => {
  it('el evento con su respaldo traído de Eventia no se repite en la lista de eventos (decisión 45)', () =>
    entorno(async () => {
      const { oferente, servicio, ejecutar } = armar();
      oferente.respaldos.mockResolvedValue([
        {
          id: 31,
          numero: '5040-126-TD26',
          mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
          contrato: 'Almuerzo delegación',
          anio: 2025,
          monto: 1_245_000,
          fuente: 'mercado_publico',
          evento: 455,
          archivo: 'Orden de compra 5040-126-TD26.pdf',
        },
      ]);
      await servicio.generarAnexos(1, CUENTA, 40, { monto_total: 11_900_000 });
      const sistema = planDe(ejecutar).sistema;
      expect(sistema).toContain(
        '- N° 5040-126-TD26 · ILUSTRE MUNICIPALIDAD DE QUILLON · Almuerzo delegación · 2025 · $1.245.000 con impuestos · es el evento N° 455 de Eventia (archivo «Orden de compra 5040-126-TD26.pdf»)',
      );
      // El 455 era el único evento: no vuelve a salir abajo.
      expect(sistema).not.toContain('Municipalidad de Bulnes · 150 personas');
      expect(sistema).toContain('(todos ya están arriba, con su respaldo)');
    }));
});
