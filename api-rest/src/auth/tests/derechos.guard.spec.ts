import { ForbiddenException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import 'reflect-metadata';
import { MarketingController } from 'src/marketing/marketing.controller';
import { PeopleController } from 'src/people/people.controller';
import { DERECHO_KEY, Derecho, SinPlan } from '../derecho.decorator';
import { DerechosGuard } from '../derechos.guard';
import { IS_PUBLIC_KEY } from '../public.decorator';

/**
 * EL GUARDIÁN DE LOS DERECHOS (14-09-2026, paso 3.2 del roadmap de venta).
 *
 * Nació el 14-09 como ModulosPropiosGuard, cuidando Personal y Marketing;
 * ahora cuida los derechos de todos los planes. Las pruebas de los módulos
 * propios siguen aquí porque siguen valiendo: son dos derechos más.
 */
const contexto = (
  user: Record<string, unknown> | undefined,
  handler: unknown,
  cls: unknown,
) =>
  ({
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as never;

describe('DerechosGuard', () => {
  const guard = new DerechosGuard(new Reflector());
  class Cerrado {
    ruta() {}
    abierta() {}
  }
  Derecho('personal')(Cerrado);
  Derecho(null)(
    Cerrado.prototype,
    'abierta',
    Object.getOwnPropertyDescriptor(Cerrado.prototype, 'abierta')!,
  );

  it('sin el derecho, la ruta del controller cerrado es 403', () => {
    expect(() =>
      guard.canActivate(
        contexto({ derechos: [] }, Cerrado.prototype.ruta, Cerrado),
      ),
    ).toThrow(ForbiddenException);
  });

  it('con el derecho, pasa', () => {
    expect(
      guard.canActivate(
        contexto({ derechos: ['personal'] }, Cerrado.prototype.ruta, Cerrado),
      ),
    ).toBe(true);
  });

  it('la ruta abierta con null pasa aunque el controller esté cerrado', () => {
    expect(
      guard.canActivate(
        contexto({ derechos: [] }, Cerrado.prototype.abierta, Cerrado),
      ),
    ).toBe(true);
  });

  it('sin decorador, pasa', () => {
    class Libre {
      ruta() {}
    }
    expect(
      guard.canActivate(
        contexto({ derechos: [] }, Libre.prototype.ruta, Libre),
      ),
    ).toBe(true);
  });

  it('una ruta @Public no pasa por el guardián', () => {
    class Publica {
      ruta() {}
    }
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, Publica);
    Derecho('marketing')(Publica);
    expect(
      guard.canActivate(contexto(undefined, Publica.prototype.ruta, Publica)),
    ).toBe(true);
  });

  // ── La empresa bloqueada: se le acabó la prueba y no pagó.
  describe('empresa bloqueada', () => {
    class Cualquiera {
      ruta() {}
      pagar() {}
    }
    SinPlan()(
      Cualquiera.prototype,
      'pagar',
      Object.getOwnPropertyDescriptor(Cualquiera.prototype, 'pagar')!,
    );

    it('no entra a una ruta normal, aunque no tenga candado de derecho', () => {
      expect(() =>
        guard.canActivate(
          contexto(
            { derechos: [], estado_plan: 'bloqueado' },
            Cualquiera.prototype.ruta,
            Cualquiera,
          ),
        ),
      ).toThrow(ForbiddenException);
    });

    it('sí entra a las marcadas @SinPlan, que son por donde paga', () => {
      expect(
        guard.canActivate(
          contexto(
            { derechos: [], estado_plan: 'bloqueado' },
            Cualquiera.prototype.pagar,
            Cualquiera,
          ),
        ),
      ).toBe(true);
    });

    it('el 403 dice PLAN_BLOQUEADO, para que la app muestre la pantalla', () => {
      try {
        guard.canActivate(
          contexto(
            { derechos: [], estado_plan: 'bloqueado' },
            Cualquiera.prototype.ruta,
            Cualquiera,
          ),
        );
        fail('tenía que rechazar');
      } catch (e) {
        expect((e as ForbiddenException).getResponse()).toMatchObject({
          codigo: 'PLAN_BLOQUEADO',
        });
      }
    });
  });

  it('el 403 por falta de derecho dice cuál y a qué plan subirse', () => {
    try {
      guard.canActivate(
        contexto({ derechos: [] }, Cerrado.prototype.ruta, Cerrado),
      );
      fail('tenía que rechazar');
    } catch (e) {
      expect((e as ForbiddenException).getResponse()).toMatchObject({
        codigo: 'SIN_DERECHO',
        derecho: 'personal',
      });
    }
  });
});

// ── Los módulos propios siguen siendo lo que eran: dos derechos que no da
// ningún plan, solo la columna `modulos_propios` de Valle del Sol.
describe('Personal y Marketing siguen cerrados para el resto', () => {
  const metodos: Record<number, string> = {
    [RequestMethod.GET]: 'GET',
    [RequestMethod.POST]: 'POST',
    [RequestMethod.PUT]: 'PUT',
    [RequestMethod.PATCH]: 'PATCH',
    [RequestMethod.DELETE]: 'DELETE',
  };

  const rutasDe = (cls: new (...args: never[]) => object) => {
    const base = Reflect.getMetadata(PATH_METADATA, cls) as string;
    const claseDerecho = Reflect.getMetadata(DERECHO_KEY, cls) as
      | string
      | null
      | undefined;
    const proto = cls.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(proto)
      .filter((n) => n !== 'constructor')
      .map((n) => proto[n])
      .filter((h): h is (...args: never[]) => unknown =>
        Boolean(Reflect.getMetadata(PATH_METADATA, h as object)),
      )
      .map((h) => {
        const propio = Reflect.getMetadata(DERECHO_KEY, h) as
          | string
          | null
          | undefined;
        const derecho = propio === undefined ? claseDerecho : propio;
        const metodo = Reflect.getMetadata(METHOD_METADATA, h) as number;
        const ruta = Reflect.getMetadata(PATH_METADATA, h) as string;
        return {
          via: `${metodos[metodo] ?? metodo} /${base}${ruta && ruta !== '/' ? `/${ruta}` : ''}`,
          derecho,
        };
      });
  };

  it('Personal cierra todo menos las siete puertas que usa el resto', () => {
    const rutas = rutasDe(PeopleController);
    const abiertas = rutas.filter((r) => r.derecho === null);
    const cerradas = rutas.filter((r) => r.derecho === 'personal');

    // Las siete que Post-Venta y el Dashboard necesitan sin tener el
    // módulo: sillas del evento, hoja del día, costo y pagado por mes.
    expect(abiertas).toHaveLength(7);
    expect(cerradas.length).toBeGreaterThan(30);
    expect(abiertas.length + cerradas.length).toBe(rutas.length);
  });

  it('Marketing cierra todas sus puertas', () => {
    const rutas = rutasDe(MarketingController);
    expect(rutas.length).toBeGreaterThan(0);
    expect(rutas.every((r) => r.derecho === 'marketing')).toBe(true);
  });
});
