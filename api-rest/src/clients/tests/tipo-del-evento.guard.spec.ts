import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from 'src/users/entities/user.entity';
import type { AlcanceDeRecepcion } from '../alcance-de-recepcion';
import {
  DEL_EVENTO_KEY,
  type DondeEstaElEvento,
} from '../del-evento.decorator';
import { TipoDelEventoGuard, cotizacionesDe } from '../tipo-del-evento.guard';

// EL GUARDIÁN DEL TIPO DEL EVENTO (doc 22 §9, tanda 2): lee @DelEvento,
// busca la cotización y le pregunta a AlcanceDeRecepcion.

const operaciones = { role: UserRole.OPERACIONES, company_id: 1 };

const armar = (
  donde: DondeEstaElEvento | undefined,
  peticion: Record<string, unknown>,
  restringido = true,
) => {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'get')
    .mockImplementation((clave) =>
      clave === DEL_EVENTO_KEY ? donde : undefined,
    );
  const alcance = {
    tiposDelCargo: jest
      .fn()
      .mockResolvedValue(
        restringido
          ? { prendidos: new Set(), conocidos: new Set(), sinTipo: true }
          : null,
      ),
    exigirQueLaVea: jest.fn().mockResolvedValue(undefined),
    exigirQueLaVeaLaFila: jest.fn().mockResolvedValue(undefined),
  };
  const guard = new TipoDelEventoGuard(
    reflector,
    alcance as unknown as AlcanceDeRecepcion,
  );
  const contexto = {
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user: operaciones, ...peticion }),
    }),
  } as unknown as ExecutionContext;
  return { guard, alcance, contexto };
};

describe('TipoDelEventoGuard', () => {
  it('una puerta sin marca pasa sin preguntar', async () => {
    const { guard, alcance, contexto } = armar(undefined, {});
    expect(await guard.canActivate(contexto)).toBe(true);
    expect(alcance.tiposDelCargo).not.toHaveBeenCalled();
  });

  it('quien trabaja todos los tipos pasa sin buscar el evento', async () => {
    const { guard, alcance, contexto } = armar(
      { body: 'quotation_id' },
      { body: { quotation_id: 'q1' } },
      false,
    );
    expect(await guard.canActivate(contexto)).toBe(true);
    expect(alcance.exigirQueLaVea).not.toHaveBeenCalled();
  });

  it('revisa la cotización que trae la ruta, la consulta o el cuerpo', async () => {
    const { guard, alcance, contexto } = armar(
      { body: 'quotation_id' },
      { body: { quotation_id: 'q1' } },
    );
    expect(await guard.canActivate(contexto)).toBe(true);
    expect(alcance.exigirQueLaVea).toHaveBeenCalledWith(operaciones, 'q1');
  });

  it('desde una fila de otra tabla, por el id de la ruta', async () => {
    const { guard, alcance, contexto } = armar(
      { tabla: 'payments', param: 'id' },
      { params: { id: 'p7' } },
    );
    await guard.canActivate(contexto);
    expect(alcance.exigirQueLaVeaLaFila).toHaveBeenCalledWith(
      operaciones,
      'payments',
      'p7',
    );
  });

  it('si el evento no lo ve, el 403 de AlcanceDeRecepcion sale tal cual', async () => {
    const { guard, alcance, contexto } = armar(
      { param: 'id' },
      { params: { id: 'q2' } },
    );
    alcance.exigirQueLaVea.mockRejectedValue(new Error('«Empresas»'));
    await expect(guard.canActivate(contexto)).rejects.toThrow('«Empresas»');
  });

  it('los ids de la petición, sin repetir y sin vacíos', () => {
    expect(
      cotizacionesDe(
        { filas: 'rows', campo: 'quotation_id' },
        {
          params: {},
          query: {},
          body: {
            rows: [
              { quotation_id: 'q1' },
              { quotation_id: 'q1' },
              { quotation_id: 'q2' },
              {},
            ],
          },
        },
      ),
    ).toEqual(['q1', 'q2']);
    expect(
      cotizacionesDe(
        { query: 'quotationId' },
        { params: {}, query: { quotationId: 'q3' }, body: {} },
      ),
    ).toEqual(['q3']);
    expect(
      cotizacionesDe(
        { body: 'quotation_id' },
        { params: {}, query: {}, body: {} },
      ),
    ).toEqual([]);
  });
});
