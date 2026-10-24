import { trabajarEnElTaller } from '../generacion/taller';
import type { RespaldoDePostVenta } from '../oferente/respaldos-de-post-venta';
import { armar, CUENTA, entorno, planDe } from './generacion-de-prueba';

// LA EXPERIENCIA QUE LEE LA IA DEL ANEXO (decisiones 45 y 75): los
// respaldos de «Mi empresa» y los de Post-venta que leyó «Armar postulación»
// van en una sola lista, de mayor a menor monto y de cualquier fecha; el
// período lo dicen las bases (antes, 24 meses fijos y los de Post-venta
// aparte, solo si los primeros no alcanzaban). El evento que ya tiene su
// respaldo no se repite en la lista de eventos. Lo de Post-venta queda
// anotado en el trabajo (para el ZIP y para reintentar sin volver a leer).
// Aparte de generacion.service.spec, que llegó al tope de 800 líneas del
// portero.

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
  it('los de Post-venta van en la misma lista que los de «Mi empresa», por monto, y su evento no se repite (decisión 75)', () =>
    entorno(async () => {
      const { oferente, repo, servicio, ejecutar } = armar();
      oferente.respaldos.mockResolvedValue([
        {
          numero: '4352-103-SE23',
          mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
          contrato: 'Cena del Día del Funcionario 2023',
          anio: new Date().getFullYear(),
          monto: 11_782_499,
          fuente: 'mercado_publico',
          archivo: 'OC 4352-103-SE23.pdf',
        },
      ]);
      // Una factura de Post-venta más grande que la de la carpeta va antes:
      // ya no espera a que falten las de «Mi empresa».
      const grande: RespaldoDePostVenta = {
        ...DE_POST_VENTA,
        numero: '501',
        mandante: 'Ferrocarril del Pacífico S.A.',
        contrato: 'Paseo de fin de año',
        monto: 12_614_800,
        evento: 52,
        archivo: 'Factura 501.pdf',
      };
      await servicio.generarAnexos(1, CUENTA, 40, {
        monto_total: 11_900_000,
        post_venta: [DE_POST_VENTA, grande],
      });
      const sistema = planDe(ejecutar).sistema;
      const donde = (numero: string) => sistema.indexOf(`N° ${numero} ·`);
      expect(sistema.indexOf('SUS RESPALDOS DE EXPERIENCIA')).toBeGreaterThan(
        -1,
      );
      expect(donde('501')).toBeGreaterThan(-1);
      expect(donde('501')).toBeLessThan(donde('4352-103-SE23'));
      expect(donde('4352-103-SE23')).toBeLessThan(donde('5040-126-TD26'));
      expect(sistema).not.toContain('MÁS RESPALDOS');
      expect(sistema).not.toContain('úsalos SOLO si');
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
            post_venta: [DE_POST_VENTA, grande],
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

  it('sin respaldos de Post-venta no se anota nada', () =>
    entorno(async () => {
      const { repo, servicio, ejecutar } = armar();
      await servicio.generarAnexos(1, CUENTA, 40, {
        monto_total: 11_900_000,
        post_venta: [],
      });
      expect(planDe(ejecutar).sistema).not.toContain('de Eventia (archivo');
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
    }));

  it('lo que vale lo dicen las bases (decisión 75): uno de hace 3 años se ofrece, uno sin año no, y nunca una fila sin respaldo ni fuera del período', () =>
    entorno(async () => {
      const { oferente, servicio, ejecutar } = armar();
      const este = new Date().getFullYear();
      const respaldo = (numero: string, anio: number | null) => ({
        numero,
        mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        contrato: 'Cena',
        anio,
        monto: 1_000_000,
        fuente: 'mercado_publico',
        archivo: `OC ${numero}.pdf`,
      });
      oferente.respaldos.mockResolvedValue([
        respaldo('5040-111-AG26', este),
        respaldo('4352-103-SE23', este - 3),
        respaldo('9999-1-AG21', null),
      ]);
      await servicio.generarAnexos(1, CUENTA, 40, {
        monto_total: 11_900_000,
        post_venta: [],
      });
      const sistema = planDe(ejecutar).sistema;
      expect(sistema).toContain('N° 5040-111-AG26');
      // El Día de Campo 2026 cuenta 4 años: la de 2023 tiene que llegar.
      expect(sistema).toContain(
        `N° 4352-103-SE23 · ILUSTRE MUNICIPALIDAD DE QUILLON · Cena · ${este - 3}`,
      );
      expect(sistema).not.toContain('N° 9999-1-AG21');
      expect(sistema).toContain(
        'NUNCA pongas una fila sin su respaldo ni una de fuera del período',
      );
      expect(sistema).toContain(
        'Lo que vale como experiencia lo dicen las bases, no una regla fija',
      );
      expect(sistema).toContain(
        'Si las bases no fijan un período, sirven todos.',
      );
      expect(sistema).not.toContain('24 meses y, si');
    }));

  it('de mayor a menor monto, todos juntos, sin los «No usar» ni los de su cliente en Post-venta, y con 2 de reserva; de «Mi empresa» solo las órdenes de Mercado Público (decisiones 56, 75 y 76)', () =>
    entorno(async () => {
      const { oferente, servicio, ejecutar } = armar();
      const este = new Date().getFullYear();
      const respaldo = (
        numero: string,
        monto: number,
        extra: Record<string, unknown> = {},
      ) => ({
        numero,
        mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        contrato: 'Cena',
        anio: este,
        monto,
        fuente: 'manual',
        archivo: `Factura ${numero}.pdf`,
        ...extra,
      });
      oferente.respaldos.mockResolvedValue([
        respaldo('366', 52_001),
        // Una factura en «Mi empresa» ya no cuenta: vive en Post-venta.
        respaldo('260', 11_292_880, { mandante: 'Comercial CCU S.A.' }),
        respaldo('312', 5_000_000, {
          mandante: 'JOKER SERVICIOS SPA',
          no_usar: true,
        }),
        respaldo('4352-103-SE23', 11_782_499, { fuente: 'mercado_publico' }),
        respaldo('5040-536-SE23', 4_760_000, { fuente: 'mercado_publico' }),
      ]);
      await servicio.generarAnexos(1, CUENTA, 40, {
        monto_total: 15_900_000,
        post_venta: [
          {
            ...DE_POST_VENTA,
            numero: '367',
            mandante: 'Joker Servicios SpA',
            anio: este,
          },
          { ...DE_POST_VENTA, anio: este },
        ],
      });
      const sistema = planDe(ejecutar).sistema;
      const donde = (numero: string) => sistema.indexOf(`N° ${numero} ·`);
      expect(donde('4352-103-SE23')).toBeGreaterThan(-1);
      expect(donde('4352-103-SE23')).toBeLessThan(donde('5040-536-SE23'));
      // La de Post-venta va en su lugar por monto, entre las de la carpeta.
      expect(donde('5040-536-SE23')).toBeLessThan(donde('5040-126-TD26'));
      expect(donde('260')).toBe(-1);
      expect(donde('366')).toBe(-1);
      expect(donde('312')).toBe(-1);
      // De Post-venta tampoco entra otra de un cliente marcado «No usar».
      expect(donde('367')).toBe(-1);
      expect(sistema).toContain(
        'Tómalos EN ESE ORDEN, los de más monto primero',
      );
      expect(sistema).toContain('más DOS de reserva');
      expect(sistema).not.toContain('LOS DE SIEMPRE');
    }));

  it('con la experiencia confirmada (decisión 76) van esas filas, tal cual y en orden, y queda anotada para reintentar', () =>
    entorno(async () => {
      const { oferente, repo, servicio, ejecutar } = armar();
      oferente.respaldos.mockResolvedValue([
        {
          numero: '1715-123-SE24',
          mandante: 'CORPORACION DE ASISTENCIA JUDICIAL',
          contrato: 'Actividad recreativa',
          anio: 2024,
          monto: 3_999_999,
          fuente: 'mercado_publico',
          archivo: '1715-123-SE24.pdf',
        },
      ]);
      const experiencia = {
        confirmada: true as const,
        filas: [
          {
            clave: 'mp:4366-146-SE23',
            de: 'mi_empresa' as const,
            con_respaldo: true,
            numero: '4366-146-SE23',
            mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
            contrato: 'SERV. ARRIENDO ESPACIOS Y ALIMENTACIÓN',
            anio: 2023,
            monto: 16_500_000,
            fuente: 'mercado_publico' as const,
            archivo: 'Orden de compra - 4366-146-SE23.pdf',
          },
          {
            clave: 'ev:455',
            de: 'eventia' as const,
            con_respaldo: true,
            numero: '5040-126-TD26',
            mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
            contrato: 'Almuerzo delegación',
            anio: 2025,
            monto: 1_245_000,
            fuente: 'mercado_publico' as const,
            evento: 455,
            archivo: 'Orden de compra 5040-126-TD26.pdf',
            ruta: DE_POST_VENTA.ruta,
            bytes: 900,
          },
        ],
      };
      await servicio.generarAnexos(1, CUENTA, 40, {
        monto_total: 11_900_000,
        post_venta: [DE_POST_VENTA],
        experiencia,
      });
      const sistema = planDe(ejecutar).sistema;
      expect(sistema).toContain('LA EXPERIENCIA QUE CONFIRMÓ LA EMPRESA');
      expect(sistema).toContain(
        '1. N° 4366-146-SE23 · ILUSTRE MUNICIPALIDAD DE QUILLON · SERV. ARRIENDO ESPACIOS Y ALIMENTACIÓN · 2023 · $16.500.000 con impuestos (archivo «Orden de compra - 4366-146-SE23.pdf»)',
      );
      expect(sistema).toContain(
        '2. N° 5040-126-TD26 · ILUSTRE MUNICIPALIDAD DE QUILLON · Almuerzo delegación · 2025 · $1.245.000 con impuestos · es el evento N° 455 de Eventia',
      );
      expect(sistema).toContain('van EXACTAMENTE las filas');
      // Lo demás de la carpeta no se ofrece: ya eligió la empresa.
      expect(sistema).not.toContain('SUS RESPALDOS DE EXPERIENCIA');
      expect(sistema).not.toContain('N° 1715-123-SE24');
      expect(sistema).toContain('(todos ya están arriba, con su respaldo)');
      expect(repo.crearGeneracion).toHaveBeenCalledWith(
        expect.objectContaining({
          parametros: expect.objectContaining({ experiencia }),
        }),
      );

      // Al reintentar, la misma, sin volver a pedirla.
      ejecutar.mockClear();
      repo.ultimoDeTipo.mockResolvedValue({
        id: 8,
        tipo: 'anexos',
        estado: 'error',
        parametros: {
          monto_total: 11_900_000,
          post_venta: [DE_POST_VENTA],
          experiencia,
        },
      });
      await servicio.generarAnexos(1, CUENTA, 40, { monto_total: 11_900_000 });
      expect(planDe(ejecutar).sistema).toContain(
        '1. N° 4366-146-SE23 · ILUSTRE MUNICIPALIDAD DE QUILLON',
      );
    }));

  it('a la IA no le llegan los eventos de un cliente privado que no está en la lista (decisión 76)', () =>
    entorno(async () => {
      const { eventia, oferente, servicio, ejecutar } = armar();
      oferente.oferente.mockResolvedValue({
        ...(await oferente.oferente()),
        clientes_que_se_muestran: ['cliente-ccu'],
      });
      const evento = (
        numero: number,
        cliente: string,
        extra: Record<string, unknown>,
      ) => ({
        numero,
        tipo: 'Paseo fin de año',
        fecha: '2025-12-07',
        personas: 200,
        monto: 10_000_000,
        cliente,
        fijos: [],
        ...extra,
      });
      eventia.eventosRealizados.mockResolvedValue([
        evento(118, 'CCU', {
          cliente_id: 'cliente-ccu',
          tipo_de_cliente: 'Empresas',
        }),
        evento(52, 'Ferrocarril del Pacífico S.A', {
          cliente_id: 'cliente-fepasa',
          tipo_de_cliente: 'Empresas',
        }),
        evento(273, 'Bárbara López', {
          cliente_id: 'cliente-barbara',
          tipo_de_cliente: 'Particulares',
        }),
        evento(140, 'Armada de Chile', {
          cliente_id: 'cliente-armada',
          tipo_de_cliente: 'Empresas Publicas',
        }),
      ]);
      await servicio.generarAnexos(1, CUENTA, 40, {
        monto_total: 11_900_000,
        post_venta: [],
      });
      const sistema = planDe(ejecutar).sistema;
      expect(sistema).toContain('CCU · 200 personas');
      expect(sistema).toContain('Armada de Chile · 200 personas');
      expect(sistema).not.toContain('Ferrocarril');
      expect(sistema).not.toContain('Bárbara López');
    }));
});
