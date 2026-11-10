import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import * as fs from 'fs';
import * as path from 'path';
import 'reflect-metadata';
import { HERRAMIENTAS } from 'src/asistente/herramientas';
import { DENTRO_DE_KEY, PERMISO_KEY } from '../permiso.decorator';
import { CARGOS, cargosDeFabrica, type Permiso } from '../permisos';
import { IS_PUBLIC_KEY } from '../public.decorator';
import { ROLES_KEY } from '../roles.decorator';

/**
 * LO DE FÁBRICA ES LO DE HOY (doc 22 §4.3, 05-11-2026).
 *
 * Felipe aprobó los permisos por cargo con una condición: el día que se
 * instalan, nadie gana ni pierde nada. Esta prueba lee TODAS las puertas
 * del motor (cada controlador, con sus decoradores reales) y exige dos
 * cosas:
 *  - cada puerta con `@Permiso` o `@DentroDe` da, con todo de fábrica,
 *    exactamente los cargos de su `@Roles` (o todos, si solo pide sesión);
 *  - las que no llevan permiso son exactamente las fijas de abajo, cada
 *    una con su porqué. Una puerta nueva tiene que decir de qué sección es
 *    o entrar a esta lista con su razón.
 */
type Clase = { prototype: Record<string, unknown> };
type Puerta = {
  clave: string;
  roles?: string[];
  permiso?: Permiso[];
  dentroDe?: Permiso[];
};

const archivos = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return archivos(p);
    return e.name.endsWith('.controller.ts') || e.name === 'controller.ts'
      ? [p]
      : [];
  });

const puertas: Puerta[] = archivos(path.join(__dirname, '..', '..')).flatMap(
  (archivo) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(archivo) as Record<string, unknown>;
    return Object.values(mod).flatMap((cls) => {
      if (typeof cls !== 'function') return [];
      const base = Reflect.getMetadata(PATH_METADATA, cls) as
        | string
        | undefined;
      if (base === undefined) return [];
      const proto = (cls as unknown as Clase).prototype;
      return Object.getOwnPropertyNames(proto).flatMap((nombre) => {
        const h = proto[nombre];
        if (typeof h !== 'function' || nombre === 'constructor') return [];
        const p = Reflect.getMetadata(PATH_METADATA, h) as string | undefined;
        if (p === undefined) return [];
        // El de la ruta manda sobre el del controlador, también cuando es
        // `null` o una lista vacía.
        const lee = <T>(k: string) =>
          (Reflect.hasMetadata(k, h)
            ? Reflect.getMetadata(k, h)
            : Reflect.getMetadata(k, cls)) as T | undefined;
        if (lee<boolean>(IS_PUBLIC_KEY)) return [];
        const metodo = Reflect.getMetadata(METHOD_METADATA, h) as number;
        const verbo = RequestMethod[metodo];
        const ruta = `/${base}/${p}`.replace(/\/+/g, '/').replace(/\/$/, '');
        return [
          {
            clave: `${verbo} ${ruta}`,
            roles: lee<string[]>(ROLES_KEY),
            permiso: lee<Permiso[]>(PERMISO_KEY),
            dentroDe: lee<Permiso[]>(DENTRO_DE_KEY),
          },
        ];
      });
    });
  },
);

// Las puertas que quedan solo con su `@Roles`, a propósito (doc 22 §4.3).
const FIJAS: Record<string, string[]> = {
  'La sesión propia': [
    'GET /users/:id',
    'PATCH /users/password',
    'GET /companies/:id',
    'GET /pagos/estado',
    'POST /plans/confirmation',
  ],
  'Cualquier cargo: subir y ver archivos, y el propio personaje': [
    'POST /storage/upload',
    'GET /storage/signed-url',
    'GET /users/apariencias',
    'PATCH /users/apariencia',
  ],
  'El cobro del plan: administrador': [
    'POST /pagos/suscribir',
    'POST /pagos/cambiar-plan/cotizar',
    'POST /pagos/cambiar-plan',
    'POST /pagos/cancelar',
  ],
  'Eventia Móvil, otra aplicación (doc 22 §3.3)': [
    'GET /movil/push/clave-publica',
    'POST /movil/push/dispositivos',
    'GET /movil/cocina/:quotationId/marcas',
    'POST /movil/cocina/:quotationId/marcas',
    'POST /movil/push/probar',
  ],
  'Torre de Control: su lista de correos': [
    'POST /super-admin/suscription',
    'GET /super-admin/companies',
    'POST /super-admin/companies',
    'PATCH /super-admin/companies/:id',
    'GET /super-admin/stats/last-month',
    'GET /super-admin/torre',
  ],
  // Las 9 «más abiertas que sus pantallas» ya no están acá: el 06-11-2026
  // Felipe decidió («si hazlo si») que cada una sea de la sección de su
  // pantalla, y borrar las tres que nadie llamaba (doc 22 §4.3).
};

const deHoy = (roles?: readonly string[]) =>
  CARGOS.filter((c) => !roles?.length || roles.includes(c));

describe('Permisos por cargo: lo de fábrica es lo de hoy', () => {
  it('lee todas las puertas con sesión', () => {
    expect(puertas.length).toBeGreaterThan(350);
  });

  it('cada puerta con permisos da, de fábrica, exactamente su @Roles', () => {
    const distintas = puertas
      .filter((p) => p.permiso?.length || p.dentroDe?.length)
      .filter((p) => cargosDeFabrica(p).join() !== deHoy(p.roles).join())
      .map((p) => `${p.clave}: ${cargosDeFabrica(p).join('/')}`);
    expect(distintas).toEqual([]);
  });

  it('las que no llevan permiso son exactamente las fijas', () => {
    const sinPermiso = puertas
      .filter((p) => !p.permiso?.length && !p.dentroDe?.length)
      .map((p) => p.clave)
      .sort();
    expect(sinPermiso).toEqual(Object.values(FIJAS).flat().sort());
  });

  it('BelIA: cada herramienta, de fábrica, la ven los mismos cargos', () => {
    const distintas = HERRAMIENTAS.filter(
      (h) =>
        cargosDeFabrica({
          roles: h.cargos,
          permiso: h.permiso,
          dentroDe: h.dentroDe,
        }).join() !== deHoy(h.cargos).join(),
    ).map((h) => h.nombre);
    expect(distintas).toEqual([]);
    // Y todas dicen de qué sección son.
    expect(
      HERRAMIENTAS.filter((h) => !h.permiso && !h.dentroDe).map(
        (h) => h.nombre,
      ),
    ).toEqual([]);
  });
});
