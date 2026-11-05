import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { cachePermisos, olvidarPermisos } from 'src/cache/memoria';
import { UserRole } from 'src/users/entities/user.entity';
import { mockPinoLogger } from '../../testing/mocks';
import type { FilaDePermiso } from '../permisos';
import { PermisosService } from '../permisos.service';

// LOS PERMISOS POR CARGO DE CADA EMPRESA (doc 22 §4, 05-11-2026): leer,
// cambiar, volver a lo de fábrica y la pantalla.
const EMPRESA = 7;
const TODOS_LOS_DERECHOS = [
  'base',
  'consultas',
  'asistente',
  'calendario',
  'post_venta',
  'logistica',
  'personal',
  'marketing',
  'oportunidades',
  'encuestas',
] as never;

const armar = (
  filas: FilaDePermiso[] = [],
  opciones: { ultimo?: unknown; errorAlLeer?: unknown } = {},
) => {
  const rpc = jest.fn().mockResolvedValue({ error: null });
  // Una copia en cada lectura, como la base: la memoria no puede ver los
  // cambios por tener el mismo arreglo.
  const leer = jest.fn(() =>
    Promise.resolve(
      opciones.errorAlLeer
        ? { data: null, error: opciones.errorAlLeer }
        : { data: [...filas], error: null },
    ),
  );
  const from = jest.fn((tabla: string) =>
    tabla === 'permisos_por_cargo'
      ? { select: () => ({ eq: leer }) }
      : {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: opciones.ultimo ?? null,
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        },
  );
  const service = new PermisosService(
    { client: { from, rpc } } as never,
    mockPinoLogger() as never,
  );
  return { service, rpc, leer };
};

const quien = {
  id: 'auth-felipe',
  company_id: EMPRESA,
  full_name: 'Felipe',
  derechos: TODOS_LOS_DERECHOS,
};

describe('PermisosService', () => {
  beforeEach(() => olvidarPermisos(EMPRESA));

  it('la lista del cargo se lee una vez y queda en la memoria', async () => {
    const { service, leer } = armar([
      { cargo: 'recepcion', permiso: 'cotizaciones', prendido: false },
    ]);
    expect(await service.delCargo(EMPRESA, 'recepcion')).not.toContain(
      'cotizaciones',
    );
    await service.delCargo(EMPRESA, 'vendedor');
    expect(leer).toHaveBeenCalledTimes(1);
  });

  it('si la base no responde, lo de fábrica, sin recordarlo', async () => {
    const { service, leer } = armar([], { errorAlLeer: { message: 'caída' } });
    expect(await service.delCargo(EMPRESA, 'operaciones')).toContain(
      'postventa',
    );
    expect(cachePermisos.get(String(EMPRESA))).toBeUndefined();
    await service.delCargo(EMPRESA, 'operaciones');
    expect(leer).toHaveBeenCalledTimes(2);
  });

  it('la pantalla: candado fijo, candado del plan apagado de verdad, y lo de fábrica', async () => {
    const { service } = armar([
      { cargo: 'vendedor', permiso: 'postventa', prendido: true },
    ]);
    const p = await service.pantalla(EMPRESA, ['base', 'asistente'] as never);
    const fila = (clave: string) => p.permisos.find((x) => x.clave === clave)!;
    expect(fila('usuarios').candado).toBe('fijo');
    expect(fila('usuarios').celdas.administrador).toEqual({
      prendido: true,
      fabrica: true,
    });
    // Sin el derecho de Post-Venta: con candado y apagado, aunque esté
    // guardado prendido.
    expect(fila('postventa').candado).toBe('plan');
    expect(fila('postventa').celdas.vendedor.prendido).toBe(false);
    expect(fila('postventa').celdas.operaciones.prendido).toBe(false);
    expect(fila('cotizaciones').candado).toBeNull();
    expect(p.deFabrica).toBe(false);
  });

  it('cambiar: guarda el cambio con lo de fábrica, lo anota y rige al instante', async () => {
    const guardadas: FilaDePermiso[] = [];
    const { service, rpc } = armar(guardadas);
    rpc.mockImplementation(() => {
      guardadas.push({
        cargo: 'recepcion',
        permiso: 'cotizaciones',
        prendido: false,
      });
      return Promise.resolve({ error: null });
    });
    // La memoria, con lo de antes.
    expect(await service.delCargo(EMPRESA, 'recepcion')).toContain(
      'cotizaciones',
    );
    await service.cambiar(quien, UserRole.RECEPCION, 'cotizaciones', false);
    expect(rpc).toHaveBeenCalledWith('permisos_por_cargo_cambiar', {
      p_company_id: EMPRESA,
      p_cargo: 'recepcion',
      p_permiso: 'cotizaciones',
      p_prendido: false,
      p_de_fabrica: true,
      p_usuario_id: 'auth-felipe',
      p_usuario_nombre: 'Felipe',
    });
    // Rige al instante: la próxima petición ya lo ve.
    expect(await service.delCargo(EMPRESA, 'recepcion')).not.toContain(
      'cotizaciones',
    );
  });

  it('cambiar a como ya estaba no anota nada', async () => {
    const { service, rpc } = armar();
    await service.cambiar(quien, UserRole.RECEPCION, 'cotizaciones', true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('Mi empresa y Usuarios no se tocan', async () => {
    const { service, rpc } = armar();
    await expect(
      service.cambiar(quien, UserRole.ADMINISTRADOR, 'usuarios', false),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.cambiar(quien, UserRole.VENDEDOR, 'mi_empresa', true),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lo que el plan no trae no se prende (SIN_DERECHO), pero se puede apagar', async () => {
    const { service, rpc } = armar();
    const sinPostVenta = { ...quien, derechos: ['base'] as never };
    const error = await service
      .cambiar(sinPostVenta, UserRole.VENDEDOR, 'postventa', true)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      codigo: 'SIN_DERECHO',
    });
    await service.cambiar(
      sinPostVenta,
      UserRole.OPERACIONES,
      'postventa',
      false,
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('volver a lo de fábrica borra lo apartado y lo anota; si no hay nada, no anota', async () => {
    const con = armar([
      { cargo: 'recepcion', permiso: 'cotizaciones', prendido: false },
    ]);
    await con.service.volverAFabrica(quien);
    expect(con.rpc).toHaveBeenCalledWith('permisos_por_cargo_a_fabrica', {
      p_company_id: EMPRESA,
      p_usuario_id: 'auth-felipe',
      p_usuario_nombre: 'Felipe',
    });
    const sin = armar();
    await sin.service.volverAFabrica(quien);
    expect(sin.rpc).not.toHaveBeenCalled();
  });

  it('el último cambio viaja a la pantalla', async () => {
    const { service } = armar([], {
      ultimo: {
        usuario_nombre: 'Felipe',
        creado_en: '2026-11-05T21:30:00Z',
        accion: 'cambio',
        cargo: 'recepcion',
        permiso: 'cotizaciones',
        prendido: false,
      },
    });
    const p = await service.pantalla(EMPRESA, TODOS_LOS_DERECHOS);
    expect(p.ultimoCambio).toEqual({
      quien: 'Felipe',
      cuando: '2026-11-05T21:30:00Z',
      accion: 'cambio',
      cargo: 'recepcion',
      permiso: 'cotizaciones',
      prendido: false,
    });
    expect(p.deFabrica).toBe(true);
  });
});
