import { ForbiddenException } from '@nestjs/common';
import { inicioDelMesEnChile } from '../../utils/dates';
import {
  DERECHOS_POR_PLAN,
  assertCupo,
  assertDerecho,
  derechosDe,
  type Derecho,
} from '../derechos';

/**
 * LOS DERECHOS POR PLAN (14-09-2026, paso 3.2 del roadmap de venta).
 *
 * La prueba que más importa de este archivo es la última: Valle del Sol
 * tiene que quedar EXACTAMENTE como estaba. Regla textual de Felipe: "no
 * quiero tocar nada en la empresa Valle del Sol".
 */
describe('derechosDe', () => {
  it('Cotiza trae lo básico, con sus dos topes', () => {
    const d = derechosDe({ plan: 'cotiza', estado_plan: 'activo' });
    expect(d.derechos).toEqual(['base']);
    expect(d.usuarios_max).toBe(1);
    expect(d.cotizaciones_mes).toBe(20);
  });

  it('Gestiona y Cobra suma Post-Venta, portal, calendario y varios días', () => {
    const d = derechosDe({ plan: 'gestiona', estado_plan: 'activo' });
    expect(d.derechos).toContain('base');
    expect(d.derechos).toContain('post_venta');
    expect(d.derechos).toContain('portal');
    expect(d.derechos).toContain('calendario');
    expect(d.derechos).toContain('varios_dias');
    expect(d.derechos).toContain('clientes_360');
    expect(d.derechos).toContain('dashboard_2');
    // Lo de Opera y Crece NO entra.
    expect(d.derechos).not.toContain('logistica');
    expect(d.derechos).not.toContain('dashboard_3');
    expect(d.derechos).not.toContain('consultas');
    expect(d.usuarios_max).toBe(3);
    expect(d.cotizaciones_mes).toBeNull();
  });

  it('Opera y Crece lo trae todo y sin topes', () => {
    const d = derechosDe({ plan: 'crece', estado_plan: 'activo' });
    for (const derecho of [
      'logistica',
      'gestion_y_cocina',
      'dashboard_3',
      'consultas',
      'correos_automaticos',
      'encuestas',
      'movil',
    ] as Derecho[]) {
      expect(d.derechos).toContain(derecho);
    }
    expect(d.usuarios_max).toBeNull();
    expect(d.cotizaciones_mes).toBeNull();
  });

  it('los planes son acumulativos: cada uno incluye al anterior', () => {
    for (const derecho of DERECHOS_POR_PLAN.cotiza.derechos) {
      expect(DERECHOS_POR_PLAN.gestiona.derechos).toContain(derecho);
    }
    for (const derecho of DERECHOS_POR_PLAN.gestiona.derechos) {
      expect(DERECHOS_POR_PLAN.crece.derechos).toContain(derecho);
    }
  });

  it('en prueba se viven los 7 días con todo, sea cual sea el plan', () => {
    const d = derechosDe({ plan: 'cotiza', estado_plan: 'prueba' });
    expect(d.derechos).toEqual(DERECHOS_POR_PLAN.crece.derechos);
    expect(d.cotizaciones_mes).toBeNull();
  });

  it('bloqueada no tiene ningún derecho', () => {
    const d = derechosDe({ plan: 'crece', estado_plan: 'bloqueado' });
    expect(d.derechos).toEqual([]);
    expect(d.usuarios_max).toBe(0);
    expect(d.cotizaciones_mes).toBe(0);
  });

  it('bloqueada tampoco conserva sus módulos propios', () => {
    const d = derechosDe({
      plan: 'crece',
      estado_plan: 'bloqueado',
      modulos_propios: ['personal', 'marketing'],
    });
    expect(d.derechos).toEqual([]);
  });

  it('morosa conserva todo: durante la gracia solo recibe avisos', () => {
    const activa = derechosDe({ plan: 'gestiona', estado_plan: 'activo' });
    const morosa = derechosDe({ plan: 'gestiona', estado_plan: 'moroso' });
    expect(morosa).toEqual(activa);
  });

  it('sin plan en la base se trata como Cotiza, nunca como más', () => {
    // Pasa si la migración 112 no se aplicó: la elección segura es el
    // plan más chico, no el más grande.
    const d = derechosDe({ plan: null, estado_plan: 'activo' });
    expect(d.derechos).toEqual(['base']);
  });

  it('un plan que no existe tampoco abre nada de más', () => {
    const d = derechosDe({ plan: 'inventado', estado_plan: 'activo' });
    expect(d.derechos).toEqual(['base']);
  });

  it('los módulos propios se suman al plan, y solo los dos que existen', () => {
    const d = derechosDe({
      plan: 'cotiza',
      estado_plan: 'activo',
      modulos_propios: ['personal', 'marketing', 'inventado'],
    });
    expect(d.derechos).toContain('personal');
    expect(d.derechos).toContain('marketing');
    expect(d.derechos).not.toContain('inventado' as Derecho);
  });

  // ── LA PRUEBA QUE CUIDA A VALLE DEL SOL ──────────────────────────────
  it('Valle del Sol no pierde NADA: todo Crece más Personal y Marketing', () => {
    // Tal como queda la empresa 1 después de la migración 112.
    const valleDelSol = derechosDe({
      plan: 'crece',
      estado_plan: 'activo',
      modulos_propios: ['personal', 'marketing'],
    });

    const todos: Derecho[] = [
      'base',
      'varios_dias',
      'post_venta',
      'portal',
      'clientes_360',
      'calendario',
      'dashboard_2',
      'logistica',
      'gestion_y_cocina',
      'dashboard_3',
      'consultas',
      'correos_automaticos',
      'encuestas',
      'movil',
      'personal',
      'marketing',
    ];
    for (const derecho of todos) {
      expect(valleDelSol.derechos).toContain(derecho);
    }
    expect(valleDelSol.usuarios_max).toBeNull();
    expect(valleDelSol.cotizaciones_mes).toBeNull();
  });
});

describe('assertDerecho', () => {
  it('deja pasar si el derecho está', () => {
    expect(() => assertDerecho(['calendario'], 'calendario')).not.toThrow();
  });

  it('rechaza con el plan al que hay que subirse', () => {
    try {
      assertDerecho([], 'calendario');
      fail('tenía que rechazar');
    } catch (e) {
      expect((e as ForbiddenException).getResponse()).toMatchObject({
        codigo: 'SIN_DERECHO',
        derecho: 'calendario',
        plan_minimo: 'gestiona',
      });
    }
  });

  it('los módulos propios no ofrecen mejora de plan: no se venden', () => {
    try {
      assertDerecho([], 'personal');
      fail('tenía que rechazar');
    } catch (e) {
      const cuerpo = (e as ForbiddenException).getResponse() as {
        plan_minimo: string | null;
        mensaje: string;
      };
      expect(cuerpo.plan_minimo).toBeNull();
      expect(cuerpo.mensaje).toContain('no está disponible');
    }
  });

  it('una lista de derechos que no llegó no abre nada', () => {
    expect(() => assertDerecho(undefined, 'post_venta')).toThrow(
      ForbiddenException,
    );
  });
});

describe('assertCupo', () => {
  it('sin tope no rechaza nunca', () => {
    expect(() =>
      assertCupo('cotizaciones_mes', 999, null, 'crece'),
    ).not.toThrow();
  });

  it('en el borde: 19 pasa, 20 ya no', () => {
    expect(() =>
      assertCupo('cotizaciones_mes', 19, 20, 'cotiza'),
    ).not.toThrow();
    expect(() => assertCupo('cotizaciones_mes', 20, 20, 'cotiza')).toThrow(
      ForbiddenException,
    );
    expect(() => assertCupo('cotizaciones_mes', 21, 20, 'cotiza')).toThrow(
      ForbiddenException,
    );
  });

  it('el usuario único de Cotiza: el segundo no entra', () => {
    expect(() => assertCupo('usuarios_max', 0, 1, 'cotiza')).not.toThrow();
    try {
      assertCupo('usuarios_max', 1, 1, 'cotiza');
      fail('tenía que rechazar');
    } catch (e) {
      const cuerpo = (e as ForbiddenException).getResponse() as {
        codigo: string;
        tope: number;
        mensaje: string;
      };
      expect(cuerpo.codigo).toBe('SIN_CUPO');
      expect(cuerpo.tope).toBe(1);
      expect(cuerpo.mensaje).toContain('1 usuario');
    }
  });
});

describe('el mes que cuenta es el chileno', () => {
  it('una cotización del 31 a las 22:30 pertenece a ESE mes', () => {
    // 1 de septiembre 01:30 UTC son las 22:30 del 31 de agosto en Chile.
    const inicio = inicioDelMesEnChile(new Date('2026-09-01T01:30:00Z'));
    expect(inicio.toISOString()).toBe('2026-08-01T04:00:00.000Z');
  });

  it('a mitad de mes devuelve el día 1 de ese mes', () => {
    const inicio = inicioDelMesEnChile(new Date('2026-09-14T12:00:00Z'));
    expect(inicio.toISOString()).toBe('2026-09-01T04:00:00.000Z');
  });

  it('en verano chileno el desfase es de tres horas, no cuatro', () => {
    const inicio = inicioDelMesEnChile(new Date('2026-01-10T00:00:00Z'));
    expect(inicio.toISOString()).toBe('2026-01-01T03:00:00.000Z');
  });
});
