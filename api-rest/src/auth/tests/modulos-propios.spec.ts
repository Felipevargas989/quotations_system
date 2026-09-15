import { ForbiddenException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import 'reflect-metadata';
import { MarketingController } from 'src/marketing/marketing.controller';
import { PeopleController } from 'src/people/people.controller';
import { MODULO_PROPIO_KEY, ModuloPropio } from '../modulo-propio.decorator';
import { ModulosPropiosGuard } from '../modulos-propios.guard';
import { IS_PUBLIC_KEY } from '../public.decorator';

/**
 * MÓDULOS PROPIOS (14-09-2026, paso 3 del roadmap de venta). Personal y
 * Marketing son de Valle del Sol: una empresa sin el módulo encendido
 * recibe 403 en todas sus rutas, salvo las siete de Personal que usan
 * Post-Venta y el Dashboard, que quedan abiertas a propósito.
 */
const contexto = (
  modulos: string[] | undefined,
  handler: unknown,
  cls: unknown,
) =>
  ({
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({ user: { modulos_propios: modulos } }),
    }),
  }) as never;

describe('ModulosPropiosGuard', () => {
  const guard = new ModulosPropiosGuard(new Reflector());
  class Cerrado {
    ruta() {}
    abierta() {}
  }
  ModuloPropio('personal')(Cerrado);
  ModuloPropio(null)(
    Cerrado.prototype,
    'abierta',
    Object.getOwnPropertyDescriptor(Cerrado.prototype, 'abierta')!,
  );

  it('sin el módulo, la ruta del controller cerrado es 403', () => {
    expect(() =>
      guard.canActivate(contexto([], Cerrado.prototype.ruta, Cerrado)),
    ).toThrow(ForbiddenException);
  });
  it('con el módulo, pasa', () => {
    expect(
      guard.canActivate(
        contexto(['personal'], Cerrado.prototype.ruta, Cerrado),
      ),
    ).toBe(true);
  });
  it('la ruta abierta con null pasa aunque el controller esté cerrado', () => {
    expect(
      guard.canActivate(contexto([], Cerrado.prototype.abierta, Cerrado)),
    ).toBe(true);
  });
  it('sin decorador, pasa', () => {
    class Libre {
      ruta() {}
    }
    expect(guard.canActivate(contexto([], Libre.prototype.ruta, Libre))).toBe(
      true,
    );
  });
});

const rutasDe = (cls: abstract new (...a: never[]) => unknown) => {
  const proto = cls.prototype as Record<string, unknown>;
  const claseModulo = Reflect.getMetadata(MODULO_PROPIO_KEY, cls) as
    | string
    | undefined;
  const out: Record<string, string | null | undefined> = {};
  for (const n of Object.getOwnPropertyNames(proto)) {
    const h = proto[n];
    if (typeof h !== 'function' || n === 'constructor') continue;
    const path = Reflect.getMetadata(PATH_METADATA, h) as string | undefined;
    if (path === undefined) continue;
    if (Reflect.getMetadata(IS_PUBLIC_KEY, h)) continue;
    const propio = Reflect.getMetadata(MODULO_PROPIO_KEY, h) as
      | string
      | null
      | undefined;
    const efectivo = propio !== undefined ? propio : claseModulo;
    out[
      `${RequestMethod[Reflect.getMetadata(METHOD_METADATA, h) as number]} ${path === '/' ? '' : path}`
    ] = efectivo;
  }
  return out;
};

describe('Personal y Marketing en el motor', () => {
  it('Personal: todo cerrado salvo las 7 rutas que usan Post-Venta y el Dashboard', () => {
    const rutas = rutasDe(PeopleController);
    const abiertas = Object.entries(rutas)
      .filter(([, m]) => !m)
      .map(([k]) => k)
      .sort();
    expect(abiertas).toEqual(
      [
        'DELETE staff/:id',
        'GET costo-personal',
        'GET pagado-por-mes',
        'GET sheets',
        'GET staff',
        'PATCH staff/:id',
        'POST staff',
      ].sort(),
    );
    expect(
      Object.values(rutas).filter((m) => m === 'personal').length,
    ).toBeGreaterThanOrEqual(35);
  });
  it('Marketing: todas sus rutas con sesión exigen el módulo', () => {
    const rutas = rutasDe(MarketingController);
    expect(Object.keys(rutas).length).toBeGreaterThan(20);
    expect(Object.values(rutas).every((m) => m === 'marketing')).toBe(true);
  });
});
