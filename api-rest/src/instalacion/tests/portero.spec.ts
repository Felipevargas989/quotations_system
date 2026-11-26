import type { ExecutionContext } from '@nestjs/common';
import { Controller, NotFoundException, Post } from '@nestjs/common';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { API_ROUTES } from 'src/constants/api.routes';
import { LicitaController } from 'src/licita/licita.controller';
import { PagosController } from 'src/pagos/pagos.controller';
import { PlansController } from 'src/plans/plans.controller';
import { UsersController } from 'src/users/users.controller';
import { PorteroDeLaInstalacionGuard } from '../portero-de-la-instalacion.guard';
import {
  abiertoEnLicita,
  rutaAbiertaEnLicita,
  rutaCompleta,
  RUTAS_ABIERTAS_EN_LICITA,
  RUTAS_CERRADAS_EN_LICITA,
} from '../rutas-de-licita';

// EL PORTERO DE LA INSTALACIÓN (paso 2 de Licita, 25-11): en Licita deja
// pasar Oportunidades y la lista mínima y cierra lo demás con 404; en
// Eventia no cierra nada.

@Controller('oportunidades')
class DeOportunidades {}
@Controller('oportunidades/mercado')
class DelMercado {}
@Controller(API_ROUTES.USERS)
class DeUsuarios {}
@Controller('health')
class DeSalud {}
@Controller('quotations')
class DelCotizador {}
@Controller('clients/:clientId')
class DeClientes {}
@Controller()
class SinPrefijo {}

const contexto = (
  clase: object,
  path = '/x',
  method = 'GET',
  manejador: (...a: never[]) => unknown = () => undefined,
) =>
  ({
    getType: () => 'http',
    getClass: () => clase,
    getHandler: () => manejador,
    switchToHttp: () => ({ getRequest: () => ({ path, method }) }),
  }) as unknown as ExecutionContext;

const antes = process.env.INSTALACION;
afterEach(() => {
  if (antes === undefined) delete process.env.INSTALACION;
  else process.env.INSTALACION = antes;
});

describe('abiertoEnLicita', () => {
  it('abre Oportunidades y la lista mínima, por el primer tramo', () => {
    for (const p of [
      'oportunidades',
      'oportunidades/mercado',
      '/users',
      'health',
      'auth',
      '/auth',
      'companies',
      'permisos',
      'storage',
      'licita',
      ['otra', 'oportunidades'],
    ]) {
      expect(abiertoEnLicita(p)).toBe(true);
    }
  });

  it('cierra lo demás, también lo que solo se parece', () => {
    for (const p of [
      'quotations',
      'clients/:clientId',
      'quotations/:quotationId/facturas',
      'pagos',
      'plans',
      'asistente',
      'guia-de-la-casa',
      'super-admin',
      'oportunidades-falsas',
      'usersx',
      '',
      undefined,
    ]) {
      expect(abiertoEnLicita(p)).toBe(false);
    }
  });
});

describe('PorteroDeLaInstalacionGuard', () => {
  const portero = new PorteroDeLaInstalacionGuard();

  it('en Eventia (sin la variable o con otra cosa) no cierra nada', () => {
    for (const valor of [undefined, 'eventia', 'otra']) {
      if (valor === undefined) delete process.env.INSTALACION;
      else process.env.INSTALACION = valor;
      for (const c of [DelCotizador, DeClientes, SinPrefijo, DeOportunidades]) {
        expect(portero.canActivate(contexto(c))).toBe(true);
      }
    }
  });

  it('en Licita deja pasar Oportunidades y la lista mínima', () => {
    process.env.INSTALACION = 'licita';
    for (const c of [DeOportunidades, DelMercado, DeUsuarios, DeSalud]) {
      expect(portero.canActivate(contexto(c))).toBe(true);
    }
  });

  it('en Licita lo demás responde 404, como una ruta que no existe', () => {
    process.env.INSTALACION = 'licita';
    for (const c of [DelCotizador, DeClientes, SinPrefijo]) {
      expect(() =>
        portero.canActivate(contexto(c, '/quotations/1', 'PATCH')),
      ).toThrow(NotFoundException);
    }
    expect(() =>
      portero.canActivate(contexto(DelCotizador, '/quotations/1', 'PATCH')),
    ).toThrow('Cannot PATCH /quotations/1');
  });
});

describe('la ruta exacta (segunda tanda, 25-11)', () => {
  it('arma la ruta completa sin barras de más', () => {
    expect(rutaCompleta('/users', '/signup')).toBe('users/signup');
    expect(rutaCompleta('pagos', '/')).toBe('pagos');
    expect(rutaCompleta('', 'x')).toBe('x');
  });

  it('cierra POST users/signup dentro de users y deja lo demás de users', () => {
    expect(rutaAbiertaEnLicita('users', 'signup', 'POST')).toBe(false);
    expect(rutaAbiertaEnLicita('/users', '/signup/', 'post')).toBe(false);
    // Otro método en la misma ruta, u otra ruta: manda el prefijo.
    expect(rutaAbiertaEnLicita('users', 'signup', 'GET')).toBe(true);
    expect(rutaAbiertaEnLicita('users', ':id', 'GET')).toBe(true);
    expect(rutaAbiertaEnLicita('users', '/', 'POST')).toBe(true);
  });

  it('abre lo justo de pagos y deja cerrado el resto (cambiar-plan*)', () => {
    expect(rutaAbiertaEnLicita('pagos', 'suscribir', 'POST')).toBe(true);
    expect(rutaAbiertaEnLicita('pagos', 'estado', 'GET')).toBe(true);
    expect(rutaAbiertaEnLicita('pagos', 'cancelar', 'POST')).toBe(true);
    expect(rutaAbiertaEnLicita('pagos', 'webhook', 'POST')).toBe(true);
    expect(rutaAbiertaEnLicita('pagos', 'estado', 'POST')).toBe(false);
    expect(rutaAbiertaEnLicita('pagos', 'cambiar-plan', 'POST')).toBe(false);
    expect(rutaAbiertaEnLicita('pagos', 'cambiar-plan/cotizar', 'POST')).toBe(
      false,
    );
    expect(rutaAbiertaEnLicita('pagos', undefined, undefined)).toBe(false);
    expect(rutaAbiertaEnLicita('plans', 'confirmation', 'POST')).toBe(false);
  });

  it('el portero lee la ruta del decorador, no la URL', () => {
    process.env.INSTALACION = 'licita';
    @Controller(API_ROUTES.USERS)
    class UsuariosDePrueba {
      @Post('signup')
      signup() {}
      @Post()
      crear() {}
    }
    const portero = new PorteroDeLaInstalacionGuard();
    const p = UsuariosDePrueba.prototype;
    expect(() =>
      portero.canActivate(
        contexto(UsuariosDePrueba, '/users/signup', 'POST', p.signup),
      ),
    ).toThrow('Cannot POST /users/signup');
    expect(
      portero.canActivate(
        contexto(UsuariosDePrueba, '/users', 'POST', p.crear),
      ),
    ).toBe(true);
  });

  // Los controladores de verdad, con sus decoradores de verdad.
  const reales: Array<{
    clase: object;
    metodo: string;
    url: string;
    verbo: string;
    abiertaEnLicita: boolean;
  }> = [
    {
      clase: UsersController,
      metodo: 'signup',
      url: '/users/signup',
      verbo: 'POST',
      abiertaEnLicita: false,
    },
    {
      clase: UsersController,
      metodo: 'findOne',
      url: '/users/u1',
      verbo: 'GET',
      abiertaEnLicita: true,
    },
    {
      clase: UsersController,
      metodo: 'create',
      url: '/users',
      verbo: 'POST',
      abiertaEnLicita: true,
    },
    {
      clase: PagosController,
      metodo: 'suscribir',
      url: '/pagos/suscribir',
      verbo: 'POST',
      abiertaEnLicita: true,
    },
    {
      clase: PagosController,
      metodo: 'estado',
      url: '/pagos/estado',
      verbo: 'GET',
      abiertaEnLicita: true,
    },
    {
      clase: PagosController,
      metodo: 'cancelar',
      url: '/pagos/cancelar',
      verbo: 'POST',
      abiertaEnLicita: true,
    },
    {
      clase: PagosController,
      metodo: 'webhook',
      url: '/pagos/webhook',
      verbo: 'POST',
      abiertaEnLicita: true,
    },
    {
      clase: PagosController,
      metodo: 'cambiarPlan',
      url: '/pagos/cambiar-plan',
      verbo: 'POST',
      abiertaEnLicita: false,
    },
    {
      clase: PagosController,
      metodo: 'cotizarCambio',
      url: '/pagos/cambiar-plan/cotizar',
      verbo: 'POST',
      abiertaEnLicita: false,
    },
    {
      clase: PlansController,
      metodo: 'confirmPlan',
      url: '/plans/confirmation',
      verbo: 'POST',
      abiertaEnLicita: false,
    },
    {
      clase: LicitaController,
      metodo: 'alta',
      url: '/licita/alta',
      verbo: 'POST',
      abiertaEnLicita: true,
    },
  ];

  const manejadorDe = (clase: object, metodo: string) => {
    const fn = (clase as { prototype: Record<string, unknown> }).prototype[
      metodo
    ];
    if (typeof fn !== 'function') throw new Error(`no existe ${metodo}`);
    return fn as (...a: never[]) => unknown;
  };

  it('en Licita: los controladores reales quedan como dicen las listas', () => {
    process.env.INSTALACION = 'licita';
    const portero = new PorteroDeLaInstalacionGuard();
    for (const r of reales) {
      const ctx = contexto(
        r.clase,
        r.url,
        r.verbo,
        manejadorDe(r.clase, r.metodo),
      );
      if (r.abiertaEnLicita) expect(portero.canActivate(ctx)).toBe(true);
      else
        expect(() => portero.canActivate(ctx)).toThrow(
          `Cannot ${r.verbo} ${r.url}`,
        );
    }
  });

  it('en Eventia: el portero no cierra ninguna (tampoco users/signup ni cambiar-plan)', () => {
    for (const valor of [undefined, 'eventia']) {
      if (valor === undefined) delete process.env.INSTALACION;
      else process.env.INSTALACION = valor;
      const portero = new PorteroDeLaInstalacionGuard();
      for (const r of reales) {
        expect(
          portero.canActivate(
            contexto(r.clase, r.url, r.verbo, manejadorDe(r.clase, r.metodo)),
          ),
        ).toBe(true);
      }
    }
  });
});

// El barrido de todo el motor: qué controladores quedan abiertos en Licita.
// Si alguien agrega un controlador a un módulo abierto, o un prefijo a la
// lista, esta prueba lo hace decir en voz alta.
const controladores = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return controladores(ruta);
    return n.endsWith('.controller.ts') ? [ruta] : [];
  });

describe('el barrido de los controladores del motor', () => {
  const src = join(__dirname, '..', '..');
  const prefijos = controladores(src)
    .map((ruta) => {
      const texto = readFileSync(ruta, 'utf8');
      const m = /@Controller\(\s*(?:'([^']*)'|API_ROUTES\.(\w+))?\s*\)/.exec(
        texto,
      );
      if (!m) return null;
      const prefijo =
        m[1] ?? (m[2] ? API_ROUTES[m[2] as keyof typeof API_ROUTES] : '');
      return { archivo: relative(src, ruta), prefijo };
    })
    .filter((c): c is { archivo: string; prefijo: string } => c !== null);

  it('encuentra los controladores del motor', () => {
    expect(prefijos.length).toBeGreaterThan(50);
  });

  it('en Licita quedan abiertos los 9 de Oportunidades y los 7 de la lista mínima', () => {
    const abiertos = prefijos
      .filter((c) => abiertoEnLicita(c.prefijo))
      .map((c) => c.archivo)
      .sort();
    expect(abiertos).toEqual(
      [
        'auth/auth.controller.ts',
        'auth/permisos.controller.ts',
        'companies/companies.controller.ts',
        'health/health.controller.ts',
        'licita/licita.controller.ts',
        'oportunidades/aprendizajes/aprendizajes.controller.ts',
        'oportunidades/comparacion/comparacion.controller.ts',
        'oportunidades/competencia/competencia.controller.ts',
        'oportunidades/datos-abiertos/datos-abiertos.controller.ts',
        'oportunidades/oportunidades.controller.ts',
        'oportunidades/postulacion/editor-del-word.controller.ts',
        'oportunidades/postulacion/postulacion.controller.ts',
        'oportunidades/preguntas/preguntas.controller.ts',
        'oportunidades/seguimiento/seguimiento.controller.ts',
        'storage/storage.controller.ts',
        'users/users.controller.ts',
      ].sort(),
    );
  });

  it('todo controlador de oportunidades/ queda abierto', () => {
    const deOportunidades = prefijos.filter((c) =>
      c.archivo.startsWith('oportunidades/'),
    );
    expect(deOportunidades).toHaveLength(9);
    expect(deOportunidades.every((c) => abiertoEnLicita(c.prefijo))).toBe(true);
  });
});

// El barrido por ruta: cada método con @Get/@Post/... de cada controlador.
// Amarra que las dos listas nombren rutas que existen (un nombre mal escrito
// no cierra ni abre nada en silencio) y qué queda abierto en pagos, plans y
// users.
const VERBO = /@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/g;

describe('el barrido de las rutas del motor', () => {
  const src = join(__dirname, '..', '..');
  const rutas = controladores(src).flatMap((ruta) => {
    const texto = readFileSync(ruta, 'utf8');
    const m = /@Controller\(\s*(?:'([^']*)'|API_ROUTES\.(\w+))?\s*\)/.exec(
      texto,
    );
    if (!m) return [];
    const prefijo =
      m[1] ?? (m[2] ? API_ROUTES[m[2] as keyof typeof API_ROUTES] : '');
    return [...texto.matchAll(VERBO)].map((v) => ({
      archivo: relative(src, ruta),
      prefijo,
      metodo: v[1].toUpperCase(),
      ruta: v[2] ?? '',
    }));
  });
  const abiertas = (filtro: (r: (typeof rutas)[number]) => boolean) =>
    rutas
      .filter(filtro)
      .filter((r) => rutaAbiertaEnLicita(r.prefijo, r.ruta, r.metodo))
      .map((r) => `${r.metodo} ${rutaCompleta(r.prefijo, r.ruta)}`)
      .sort();

  it('encuentra las rutas del motor', () => {
    expect(rutas.length).toBeGreaterThan(300);
  });

  it('cada ruta de las dos listas existe en el motor', () => {
    const todas = new Set(
      rutas.map((r) => `${r.metodo} ${rutaCompleta(r.prefijo, r.ruta)}`),
    );
    for (const r of [
      ...RUTAS_CERRADAS_EN_LICITA,
      ...RUTAS_ABIERTAS_EN_LICITA,
    ]) {
      expect(todas).toContain(`${r.metodo} ${r.ruta}`);
    }
  });

  it('de pagos quedan abiertas solo las cuatro de la lista', () => {
    expect(abiertas((r) => r.archivo === 'pagos/pagos.controller.ts')).toEqual([
      'GET pagos/estado',
      'POST pagos/cancelar',
      'POST pagos/suscribir',
      'POST pagos/webhook',
    ]);
  });

  it('plans queda cerrado entero', () => {
    expect(abiertas((r) => r.archivo === 'plans/plans.controller.ts')).toEqual(
      [],
    );
  });

  it('de users queda abierto todo menos el alta de Eventia', () => {
    const deUsers = rutas.filter(
      (r) => r.archivo === 'users/users.controller.ts',
    );
    expect(deUsers.length).toBeGreaterThan(5);
    expect(abiertas((r) => r.archivo === 'users/users.controller.ts')).toEqual(
      deUsers
        .map((r) => `${r.metodo} ${rutaCompleta(r.prefijo, r.ruta)}`)
        .filter((r) => r !== 'POST users/signup')
        .sort(),
    );
  });

  it('el alta de Licita queda abierta', () => {
    expect(
      abiertas((r) => r.archivo === 'licita/licita.controller.ts'),
    ).toEqual(['POST licita/alta']);
  });
});
