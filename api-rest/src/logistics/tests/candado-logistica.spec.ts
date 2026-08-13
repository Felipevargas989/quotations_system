import { BadRequestException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from '../../testing/mocks';
import { LogisticsRepository } from '../logistics.repository';

// EL CANDADO DEL EVENTO REALIZADO EN LOGÍSTICA (13-08-2026).
//
// La otra mitad del candado: recursos del evento (que definen el costo
// y por tanto el margen) y la ficha de cocina. Las notas de cocina
// también se cierran, porque son todas PREVIAS al evento — anotarle
// algo a la cocina después de que el evento ocurrió no tiene sentido.
//
// Queda ABIERTO a propósito: reimprimir la ficha (acto de archivo) y
// TOMAR la foto de costos, que es justamente lo que congela el margen.
describe('Candado del evento realizado — logística', () => {
  // Supabase encadena (.from().select().eq().eq().in().limit()), así
  // que el doble devuelve siempre el mismo objeto encadenable y guarda
  // la última respuesta preparada.
  const armar = (estados: { realizada: boolean }) => {
    const llamadas: string[] = [];
    const cadena: Record<string, unknown> = {};
    const metodos = [
      'select',
      'insert',
      'update',
      'delete',
      'upsert',
      'eq',
      'in',
      'order',
      'limit',
    ];
    for (const m of metodos) {
      cadena[m] = jest.fn(() => cadena);
    }
    // La consulta del candado se resuelve al await: si el evento está
    // realizado devuelve una fila; si no, ninguna.
    (cadena as { then?: unknown }).then = (resolver: (v: unknown) => void) =>
      resolver({
        data: estados.realizada ? [{ id: 'evento-1' }] : [],
        error: null,
      });
    (cadena as { maybeSingle?: unknown }).maybeSingle = jest
      .fn()
      .mockResolvedValue({ data: { quotation_id: 'evento-1' }, error: null });

    const client = {
      from: jest.fn((tabla: string) => {
        llamadas.push(tabla);
        return cadena;
      }),
    };
    const repo = new LogisticsRepository(
      { client } as unknown as SupabaseService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { repo, llamadas };
  };

  const congelado = () => armar({ realizada: true });
  const vivo = () => armar({ realizada: false });

  describe('evento REALIZADO: se rechaza', () => {
    it('no acepta recursos nuevos', async () => {
      const { repo } = congelado();
      await expect(
        repo.addEventResources(1, {
          rows: [{ quotation_id: 'evento-1', quantity: 1 }],
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('no acepta cambiar un recurso ya cargado', async () => {
      const { repo } = congelado();
      await expect(
        repo.updateEventResource(1, 5, { quantity: 9 } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('no acepta borrar un recurso', async () => {
      const { repo } = congelado();
      await expect(repo.deleteEventResource(1, 5)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('no acepta cambiar el horario de un servicio', async () => {
      const { repo } = congelado();
      await expect(
        repo.setServiceTime(1, {
          quotation_id: 'evento-1',
          service_name: 'Cena',
          start_time: '21:00',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('no acepta notas de cocina nuevas', async () => {
      const { repo } = congelado();
      await expect(
        repo.addKitchenNote(1, {
          quotation_id: 'evento-1',
          note: 'algo',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('no acepta borrar una nota de cocina', async () => {
      const { repo } = congelado();
      await expect(repo.deleteKitchenNote(1, 3)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('no deja BORRAR la foto de costos (sería descongelar el margen)', async () => {
      const { repo } = congelado();
      await expect(repo.clearProvisioned(1, ['evento-1'])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('no deja borrar las provisiones de insumos', async () => {
      const { repo } = congelado();
      await expect(
        repo.deleteSupplyProvisions(1, ['evento-1']),
      ).rejects.toThrow(BadRequestException);
    });

    it('SÍ deja TOMAR la foto de costos (eso es lo que congela el margen)', async () => {
      const { repo } = congelado();
      await expect(
        repo.markProvisioned(1, {
          entries: [{ id: 'evento-1', cost: 100, people: 10, services: 2 }],
        } as never),
      ).resolves.toEqual({ updated: 1 });
    });
  });

  describe('evento VIVO: pasa como siempre', () => {
    it('acepta recursos nuevos', async () => {
      const { repo } = vivo();
      await expect(
        repo.addEventResources(1, {
          rows: [{ quotation_id: 'evento-1', quantity: 1 }],
        } as never),
      ).resolves.toEqual({ added: 1 });
    });

    it('acepta notas de cocina', async () => {
      const { repo } = vivo();
      await expect(
        repo.addKitchenNote(1, {
          quotation_id: 'evento-1',
          note: 'sin sal',
        } as never),
      ).resolves.toEqual({ added: true });
    });

    it('acepta borrar la foto de costos', async () => {
      const { repo } = vivo();
      await expect(repo.clearProvisioned(1, ['evento-1'])).resolves.toEqual({
        updated: 1,
      });
    });
  });

  it('sin filas que revisar no consulta la base de balde', async () => {
    const { repo, llamadas } = vivo();
    await repo.addEventResources(1, { rows: [] } as never);
    expect(llamadas).toHaveLength(0);
  });
});
