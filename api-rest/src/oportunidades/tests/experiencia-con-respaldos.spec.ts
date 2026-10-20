import { trabajarEnElTaller } from '../generacion/taller';
import type { RespaldoDePostVenta } from '../oferente/respaldos-de-post-venta';
import { armar, CUENTA, entorno, planDe } from './generacion-de-prueba';

// LA EXPERIENCIA QUE LEE LA IA DEL ANEXO (decisión 45, 19-10): primero los
// respaldos de «Mi empresa»; después, aparte, los de Post-venta que leyó
// «Armar postulación», para usarlos solo si los primeros no alcanzan. El
// evento que ya tiene su respaldo no se repite en la lista de eventos. Lo de
// Post-venta queda anotado en el trabajo (para el ZIP y para reintentar sin
// volver a leer). Aparte de generacion.service.spec, que llegó al tope de
// 800 líneas del portero.

jest.mock('../generacion/taller', () => ({
  ...jest.requireActual<object>('../generacion/taller'),
  trabajarEnElTaller: jest.fn(),
}));
beforeEach(() => (trabajarEnElTaller as jest.Mock).mockReset());

const DE_POST_VENTA: RespaldoDePostVenta = {
  numero: '5040-126-TD26',
  mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
  contrato: 'Almuerzo delegación',
  anio: 2025,
  monto: 1_245_000,
  fuente: 'mercado_publico',
  evento: 455,
  archivo: 'Orden de compra 5040-126-TD26.pdf',
  ruta: 'c1/event-documents/q-455/ordenes_compra/x_5040-126-TD26.pdf',
  bytes: 900,
};

describe('La experiencia en los anexos', () => {
  it('los de Post-venta van aparte, después de los de «Mi empresa», y su evento no se repite (decisión 45)', () =>
    entorno(async () => {
      const { oferente, repo, servicio, ejecutar } = armar();
      oferente.respaldos.mockResolvedValue([
        {
          numero: '4352-103-SE23',
          mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
          contrato: 'Cena del Día del Funcionario 2023',
          anio: 2023,
          monto: 11_782_499,
          fuente: 'mercado_publico',
          archivo: 'OC 4352-103-SE23.pdf',
        },
      ]);
      await servicio.generarAnexos(1, CUENTA, 40, {
        monto_total: 11_900_000,
        post_venta: [DE_POST_VENTA],
      });
      const sistema = planDe(ejecutar).sistema;
      const mia = sistema.indexOf('SUS RESPALDOS DE EXPERIENCIA');
      const deEventia = sistema.indexOf(
        'MÁS RESPALDOS, DE SUS EVENTOS EN EVENTIA',
      );
      expect(mia).toBeGreaterThan(-1);
      expect(deEventia).toBeGreaterThan(mia);
      expect(sistema).toContain(
        'úsalos SOLO si los de «Mi empresa» no alcanzan para el puntaje máximo',
      );
      expect(sistema).toContain(
        '- N° 5040-126-TD26 · ILUSTRE MUNICIPALIDAD DE QUILLON · Almuerzo delegación · 2025 · $1.245.000 con impuestos · es el evento N° 455 de Eventia (archivo «Orden de compra 5040-126-TD26.pdf»)',
      );
      // El 455 era el único evento: no vuelve a salir abajo.
      expect(sistema).not.toContain('Municipalidad de Bulnes · 150 personas');
      expect(sistema).toContain('(todos ya están arriba, con su respaldo)');
      // Queda anotado en el trabajo: el ZIP lo pega desde el evento.
      expect(repo.crearGeneracion).toHaveBeenCalledWith(
        expect.objectContaining({
          parametros: expect.objectContaining({
            post_venta: [DE_POST_VENTA],
          }),
        }),
      );
    }));

  it('al reintentar los anexos, van los de Post-venta de la vez anterior, sin volver a leer', () =>
    entorno(async () => {
      const { repo, servicio, ejecutar } = armar();
      repo.ultimoDeTipo.mockResolvedValue({
        id: 8,
        tipo: 'anexos',
        estado: 'error',
        parametros: { monto_total: 11_900_000, post_venta: [DE_POST_VENTA] },
      });
      await servicio.generarAnexos(1, CUENTA, 40, { monto_total: 11_900_000 });
      expect(repo.ultimoDeTipo).toHaveBeenCalledWith(1, 40, 'anexos');
      expect(planDe(ejecutar).sistema).toContain(
        'es el evento N° 455 de Eventia',
      );
    }));

  it('sin respaldos de Post-venta no aparece esa parte ni se anota nada', () =>
    entorno(async () => {
      const { repo, servicio, ejecutar } = armar();
      await servicio.generarAnexos(1, CUENTA, 40, {
        monto_total: 11_900_000,
        post_venta: [],
      });
      expect(planDe(ejecutar).sistema).not.toContain('MÁS RESPALDOS');
      expect(repo.ultimoDeTipo).not.toHaveBeenCalledWith(1, 40, 'anexos');
      const [fila] = repo.crearGeneracion.mock.calls[0] as [
        { parametros: Record<string, unknown> },
      ];
      expect(fila.parametros).not.toHaveProperty('post_venta');
    }));

  it('un respaldo de «Mi empresa» que dice de qué evento es sigue arriba, con los de la carpeta', () =>
    entorno(async () => {
      const { oferente, servicio, ejecutar } = armar();
      oferente.respaldos.mockResolvedValue([
        {
          numero: '5043-27-AG26',
          mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
          contrato: 'Seminario de flores',
          anio: 2026,
          monto: 1_500_000,
          fuente: 'mercado_publico',
          evento: 400,
          archivo: 'Orden de compra - 5043-27-AG26.pdf',
        },
      ]);
      await servicio.generarAnexos(1, CUENTA, 40, {
        monto_total: 11_900_000,
        post_venta: [],
      });
      const sistema = planDe(ejecutar).sistema;
      expect(sistema).toContain('SUS RESPALDOS DE EXPERIENCIA');
      expect(sistema).toContain('N° 5043-27-AG26');
      expect(sistema).not.toContain('MÁS RESPALDOS');
    }));
});
