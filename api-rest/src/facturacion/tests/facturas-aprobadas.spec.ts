import { BadRequestException } from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import { FacturasAprobadasService } from '../aprobadas/facturas-aprobadas.service';

/**
 * LAS FACTURAS APROBADAS QUE ESPERAN (doc 19 §9.48; Felipe, 11-11-2026:
 * *"ya revisé y dejé la facturación hecha (…) la próxima persona, cuando
 * decida facturar, la factura está lista, llegar y pinchar no más"*).
 */

const USUARIO = {
  id: 'u-felipe',
  company_id: 1,
  full_name: 'Felipe Vargas',
  role: 'administrador',
} as never;

const PEDIDA = {
  tipo: 33,
  orden_de_compra_id: 9,
  receptor: { rut: '76.111.111-1', razon_social: 'JOKER SPA' },
  lineas: [{ descripcion: 'Evento', cantidad: 1, precio: 119000 }],
  referencias: [],
  pedir_siempre: [],
} as never;

const armar = (revision: object = { ok: true, faltan: [], problemas: [] }) => {
  const repo = {
    lista: jest.fn().mockResolvedValue([]),
    guardar: jest
      .fn()
      .mockImplementation((fila: object) =>
        Promise.resolve({ ...fila, aprobada_en: '2026-11-11T12:00:00Z' }),
      ),
    quitar: jest.fn().mockResolvedValue(undefined),
  };
  const facturas = { revisar: jest.fn().mockResolvedValue(revision) };
  const logger = mockPinoLogger();
  const servicio = new FacturasAprobadasService(
    repo as never,
    facturas as never,
    logger as never,
  );
  return { servicio, repo, facturas, logger };
};

describe('las facturas aprobadas que esperan (§9.48)', () => {
  it('aprobar guarda el documento tal como se revisó, con quién lo aprobó', async () => {
    const { servicio, repo, facturas } = armar();
    await servicio.aprobar('ev-1', USUARIO, null, PEDIDA);
    // La misma revisión de la vista previa, con la empresa de la sesión.
    expect(facturas.revisar).toHaveBeenCalledWith('ev-1', 1, PEDIDA);
    expect(repo.guardar).toHaveBeenCalledWith({
      company_id: 1,
      quotation_id: 'ev-1',
      oc_id: null,
      pedida: PEDIDA,
      aprobada_por: 'u-felipe',
      aprobada_por_nombre: 'Felipe Vargas',
    });
  });

  it('la de una OC del evento se guarda con su OC', async () => {
    const { servicio, repo } = armar();
    await servicio.aprobar('ev-1', USUARIO, 9, PEDIDA);
    expect(repo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ quotation_id: 'ev-1', oc_id: 9 }),
    );
  });

  it('lo que no está listo no se guarda: dice qué le falta', async () => {
    const { servicio, repo } = armar({
      ok: false,
      faltan: [{ campo: 'giro', texto: 'el giro' }],
      problemas: [],
    });
    await expect(
      servicio.aprobar('ev-1', USUARIO, null, PEDIDA),
    ).rejects.toThrow(new BadRequestException('Falta el giro'));
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  it('«Corregir» la quita, siempre dentro de la empresa de la sesión', async () => {
    const { servicio, repo } = armar();
    await servicio.quitar('ev-1', USUARIO, 9);
    expect(repo.quitar).toHaveBeenCalledWith(1, 'ev-1', 9);
  });

  it('al emitir deja de esperar: la del evento y la de la OC facturada', async () => {
    const { servicio, repo } = armar();
    await servicio.alEmitir(1, 'ev-1', 9);
    expect(repo.quitar).toHaveBeenCalledWith(1, 'ev-1', null);
    expect(repo.quitar).toHaveBeenCalledWith(1, 'ev-1', 9);
  });

  it('si no se puede quitar al emitir, el documento ya salió: no falla', async () => {
    const { servicio, repo, logger } = armar();
    repo.quitar.mockRejectedValue(new Error('sin base'));
    await expect(servicio.alEmitir(1, 'ev-1', null)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
