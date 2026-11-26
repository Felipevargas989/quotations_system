import { Injectable, Module } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { Cron, ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { Test } from '@nestjs/testing';
import { PlanCronService } from 'src/plans/plan-cron.service';
import { PlansModule } from 'src/plans/plans.module';
import {
  apagarLosRelojesAjenos,
  encendidoEnLicita,
  OPCIONES_DEL_RELOJ,
  prepararLosRelojes,
  RELOJES_AJENOS_ENCENDIDOS_EN_LICITA,
} from '../relojes';

// LOS RELOJES DE LA INSTALACIÓN (paso 2 de Licita, 25-11): en Licita corren
// los de Oportunidades y dos de PlanCronService; en Eventia, todos.

@Injectable()
class RelojPropio {
  @Cron('0 8 * * *', { name: 'propio' })
  radar() {}
}

@Injectable()
class RelojAjeno {
  @Cron('0 11 * * *', { name: 'ajeno' })
  cobranza() {}

  @Cron('*/30 * * * *', { name: 'ajeno-2' })
  push() {}

  noEsReloj() {}
}

@Module({ providers: [RelojPropio] })
class ModuloPropio {}

@Module({ providers: [RelojAjeno] })
class ModuloAjeno {}

const antes = process.env.INSTALACION;
afterEach(() => {
  if (antes === undefined) delete process.env.INSTALACION;
  else process.env.INSTALACION = antes;
});

it('la clave de las opciones es la de @nestjs/schedule', () => {
  expect(OPCIONES_DEL_RELOJ).toBe(SCHEDULE_CRON_OPTIONS);
});

it('en Eventia no toca nada (ni pregunta por los módulos)', () => {
  delete process.env.INSTALACION;
  const app = {
    get: () => {
      throw new Error('no debía mirar los módulos');
    },
  };
  expect(prepararLosRelojes(app as never)).toBeNull();
  process.env.INSTALACION = 'eventia';
  expect(prepararLosRelojes(app as never)).toBeNull();
});

it('apaga los de los módulos ajenos y deja los propios, arrancando de verdad', async () => {
  const modulo = await Test.createTestingModule({
    imports: [
      ScheduleModule.forRoot({ cronJobs: true }),
      ModuloPropio,
      ModuloAjeno,
    ],
  }).compile();

  const apagados = apagarLosRelojesAjenos(
    modulo.get(ModulesContainer).values() as never,
    (m) => m === ModuloPropio,
  );
  expect(apagados).toEqual([
    { clase: 'RelojAjeno', metodo: 'cobranza' },
    { clase: 'RelojAjeno', metodo: 'push' },
  ]);

  await modulo.init();
  try {
    const registro = modulo.get(SchedulerRegistry);
    expect(registro.getCronJob('propio').isActive).toBe(true);
    // Quedan registrados (se ven), pero sin andar.
    expect(registro.getCronJob('ajeno').isActive).toBe(false);
    expect(registro.getCronJob('ajeno-2').isActive).toBe(false);
  } finally {
    await modulo.close();
  }
});

// LA EXCEPCIÓN POR MÉTODO (25-11, segunda tanda): en Licita siguen andando,
// de PlanCronService, el bloqueo de las pruebas vencidas (11:00) y la
// cosecha del cobro (11:10); el aviso «tu prueba vence» (11:05) sigue
// apagado porque lleva la marca de Eventia.
// Clases propias de este bloque: la prueba de arriba ya dejó marcados los
// relojes de RelojAjeno (la metadata vive en el método, para todo el archivo).
@Injectable()
class RelojDelCobro {
  @Cron('0 11 * * *', { name: 'cobro-bloquear' })
  bloquear() {}

  @Cron('5 11 * * *', { name: 'cobro-avisar' })
  avisar() {}
}

@Module({ providers: [RelojDelCobro] })
class ModuloDelCobro {}

describe('los relojes de la prueba y el cobro en Licita', () => {
  it('la lista nombra relojes de verdad de PlanCronService, y no el aviso de las 11:05', () => {
    expect(
      RELOJES_AJENOS_ENCENDIDOS_EN_LICITA.map((r) => [r.clase, r.metodo]),
    ).toEqual([
      [PlanCronService, 'bloquearPruebasVencidas'],
      [PlanCronService, 'cosecharCobrosVencidos'],
    ]);
    const cron = (metodo: keyof PlanCronService) =>
      (
        Reflect.getMetadata(
          SCHEDULE_CRON_OPTIONS,
          PlanCronService.prototype[metodo],
        ) as { cronTime?: string } | undefined
      )?.cronTime;
    expect(cron('bloquearPruebasVencidas')).toBe('0 11 * * *');
    expect(cron('cosecharCobrosVencidos')).toBe('10 11 * * *');
    expect(cron('avisarPruebasPorVencer')).toBe('5 11 * * *');
    expect(encendidoEnLicita(PlanCronService, 'avisarPruebasPorVencer')).toBe(
      false,
    );
    expect(encendidoEnLicita(PlanCronService, 'bloquearPruebasVencidas')).toBe(
      true,
    );
    // Por clase, no por nombre: otra clase con el mismo método no cuenta.
    expect(encendidoEnLicita(RelojAjeno, 'bloquearPruebasVencidas')).toBe(
      false,
    );
  });

  it('deja andar los métodos ajenos de la excepción, arrancando de verdad', async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        ScheduleModule.forRoot({ cronJobs: true }),
        ModuloPropio,
        ModuloDelCobro,
      ],
    }).compile();

    const apagados = apagarLosRelojesAjenos(
      modulo.get(ModulesContainer).values() as never,
      (m) => m === ModuloPropio,
      (clase, metodo) => clase === RelojDelCobro && metodo === 'bloquear',
    );
    expect(apagados).toEqual([{ clase: 'RelojDelCobro', metodo: 'avisar' }]);

    await modulo.init();
    try {
      const registro = modulo.get(SchedulerRegistry);
      expect(registro.getCronJob('propio').isActive).toBe(true);
      expect(registro.getCronJob('cobro-bloquear').isActive).toBe(true);
      expect(registro.getCronJob('cobro-avisar').isActive).toBe(false);
    } finally {
      await modulo.close();
    }
  });

  it('prepararLosRelojes en Licita: apaga el aviso de las 11:05 y deja las 11:00 y las 11:10', () => {
    process.env.INSTALACION = 'licita';
    const metodos = [
      'bloquearPruebasVencidas',
      'avisarPruebasPorVencer',
      'cosecharCobrosVencidos',
    ] as const;
    const antes = metodos.map(
      (m) =>
        Reflect.getMetadata(
          SCHEDULE_CRON_OPTIONS,
          PlanCronService.prototype[m],
        ) as unknown,
    );
    const instancia = Object.create(PlanCronService.prototype) as object;
    const app = {
      get: () =>
        new Map([
          [
            'PlansModule',
            {
              metatype: PlansModule,
              providers: new Map([
                ['PlanCronService', { instance: instancia }],
              ]),
              controllers: new Map(),
            },
          ],
        ]),
    };
    try {
      expect(prepararLosRelojes(app as never)).toEqual([
        { clase: 'PlanCronService', metodo: 'avisarPruebasPorVencer' },
      ]);
      const apagado = (m: (typeof metodos)[number]) =>
        (
          Reflect.getMetadata(
            SCHEDULE_CRON_OPTIONS,
            PlanCronService.prototype[m],
          ) as { disabled?: boolean }
        ).disabled === true;
      expect(apagado('avisarPruebasPorVencer')).toBe(true);
      expect(apagado('bloquearPruebasVencidas')).toBe(false);
      expect(apagado('cosecharCobrosVencidos')).toBe(false);
    } finally {
      metodos.forEach((m, i) =>
        Reflect.defineMetadata(
          SCHEDULE_CRON_OPTIONS,
          antes[i],
          PlanCronService.prototype[m],
        ),
      );
    }
  });
});
