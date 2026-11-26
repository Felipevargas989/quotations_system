import type { INestApplicationContext, Type } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { OportunidadesModule } from 'src/oportunidades/oportunidades.module';
import { PlanCronService } from 'src/plans/plan-cron.service';
import { esLicita } from './instalacion';

// LOS RELOJES DE LA INSTALACIÓN (paso 2 del plan de Licita, 25-11). En
// Licita corren los relojes de Oportunidades (el radar, Competidores y el
// cargador del mercado) y dos de la prueba y el cobro (abajo). Los demás
// (cobranza, seguimiento, campañas, brochures, push, aviso de la prueba,
// respaldo) se apagan aquí, en un solo lugar, sin tocar sus archivos.
//
// Cómo: antes de que el motor arranque (`main.ts`, entre crear la app y
// `listen`), a cada método con `@Cron` de un módulo ajeno se le marca la
// opción `disabled` del propio @nestjs/schedule. Al arrancar, Nest lo
// registra igual, pero sin echarlo a andar. En Eventia no se toca nada.
//
// LA EXCEPCIÓN, POR MÉTODO (25-11, segunda tanda): de los relojes ajenos,
// en Licita siguen andando los de la prueba y el cobro de `PlanCronService`
// (`RELOJES_AJENOS_ENCENDIDOS_EN_LICITA`):
//  - 11:00 `bloquearPruebasVencidas`: la prueba vencida queda bloqueada.
//    No manda correos;
//  - 11:10 `cosecharCobrosVencidos`: bajadas agendadas, canceladas y
//    morosas. OJO: a la activa con el pago vencido y suscripción viva le
//    manda el correo PAGO_FALLIDO (plantilla de Eventia). Solo puede pasar
//    si `pagos` está configurado en Licita;
// y sigue APAGADO 11:05 `avisarPruebasPorVencer`, que manda el correo
// «tu prueba vence» con la marca y los enlaces de Eventia.
//
// Lo que NO es `@Cron` no se apaga aquí (ver el mapa 24): el respaldo que
// revisa a los 20 segundos de arrancar (`BackupCronService.onModuleInit`,
// solo con NODE_ENV=production) y el seguimiento al encender
// (`RUN_FOLLOWUPS_ON_BOOT`, que Licita no pone).

/** La clave con que `@Cron` guarda sus opciones en el método. No la exporta
 *  @nestjs/schedule; la prueba la compara con la de la librería. */
export const OPCIONES_DEL_RELOJ = 'SCHEDULE_CRON_OPTIONS';

type Envoltorio = { instance?: unknown };
type ModuloDeNest = {
  metatype: Type<unknown> | null | undefined;
  providers: Map<unknown, Envoltorio>;
  controllers: Map<unknown, Envoltorio>;
};

export type RelojApagado = { clase: string; metodo: string };

type RelojEncendido<T> = {
  clase: abstract new (...args: never[]) => T;
  metodo: keyof T & string;
};

/** Los relojes de módulos ajenos que en Licita siguen andando. Por clase y
 *  método: el nombre lo revisa TypeScript. */
export const RELOJES_AJENOS_ENCENDIDOS_EN_LICITA: ReadonlyArray<
  RelojEncendido<PlanCronService>
> = [
  { clase: PlanCronService, metodo: 'bloquearPruebasVencidas' },
  { clase: PlanCronService, metodo: 'cosecharCobrosVencidos' },
];

/** ¿Este método de esta clase está en la lista de los que siguen andando? */
export const encendidoEnLicita = (clase: unknown, metodo: string): boolean =>
  RELOJES_AJENOS_ENCENDIDOS_EN_LICITA.some(
    (r) => r.clase === clase && r.metodo === metodo,
  );

/** Los métodos de una instancia (su clase y las de arriba, sin Object). */
const metodosDe = (instancia: object): Array<[string, unknown]> => {
  const vistos = new Map<string, unknown>();
  let proto: object | null = Object.getPrototypeOf(instancia) as object | null;
  while (proto && proto !== Object.prototype) {
    for (const nombre of Object.getOwnPropertyNames(proto)) {
      if (nombre === 'constructor' || vistos.has(nombre)) continue;
      const d = Object.getOwnPropertyDescriptor(proto, nombre);
      if (d && typeof d.value === 'function') vistos.set(nombre, d.value);
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return [...vistos];
};

/**
 * Marca `disabled` en los `@Cron` de todo módulo que no sea propio, salvo
 * los que `seQuedaEncendido` (clase y método) deja andar. Devuelve lo que
 * apagó. Puro respecto del motor: solo toca la metadata de los
 * métodos, que @nestjs/schedule lee al arrancar.
 */
export const apagarLosRelojesAjenos = (
  modulos: Iterable<ModuloDeNest>,
  esPropio: (modulo: Type<unknown> | null | undefined) => boolean,
  seQuedaEncendido: (clase: unknown, metodo: string) => boolean = () => false,
): RelojApagado[] => {
  const apagados: RelojApagado[] = [];
  const hechos = new Set<unknown>();
  for (const modulo of modulos) {
    if (esPropio(modulo.metatype)) continue;
    for (const envoltorio of [
      ...modulo.providers.values(),
      ...modulo.controllers.values(),
    ]) {
      const instancia = envoltorio.instance;
      if (!instancia || typeof instancia !== 'object') continue;
      for (const [metodo, fn] of metodosDe(instancia)) {
        if (hechos.has(fn)) continue;
        const opciones = Reflect.getMetadata(
          OPCIONES_DEL_RELOJ,
          fn as object,
        ) as Record<string, unknown> | undefined;
        if (!opciones) continue;
        hechos.add(fn);
        if (seQuedaEncendido(instancia.constructor, metodo)) continue;
        Reflect.defineMetadata(
          OPCIONES_DEL_RELOJ,
          { ...opciones, disabled: true },
          fn as object,
        );
        apagados.push({
          clase: instancia.constructor?.name ?? '?',
          metodo,
        });
      }
    }
  }
  return apagados;
};

/** Lo que llama `main.ts` antes de `listen`. En Eventia no hace nada y
 *  devuelve null; en Licita, los relojes que apagó. */
export const prepararLosRelojes = (
  app: INestApplicationContext,
): RelojApagado[] | null => {
  if (!esLicita()) return null;
  const modulos = app.get(ModulesContainer).values();
  return apagarLosRelojesAjenos(
    modulos as Iterable<ModuloDeNest>,
    (m) => m === OportunidadesModule,
    encendidoEnLicita,
  );
};
