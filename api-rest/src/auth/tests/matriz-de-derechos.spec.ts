import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import 'reflect-metadata';
import { AnalyticsController } from 'src/analytics/analytics.controller';
import { CalendarController } from 'src/calendar/calendar.controller';
import { ClientsController } from 'src/clients/clients.controller';
import { ConsultasController } from 'src/consultas/consultas.controller';
import { EventTypesController } from 'src/consultas/event-types.controller';
import { CustomerSatisfactionSurveyController } from 'src/customer_satisfaction_survey/controller';
import { LogisticsController } from 'src/logistics/logistics.controller';
import { MarketingController } from 'src/marketing/marketing.controller';
import { MovilController } from 'src/movil/movil.controller';
import { PaymentsController } from 'src/payments/payments.controller';
import { PeopleController } from 'src/people/people.controller';
import { PortalReceiptsController } from 'src/quotations/portal-receipts.controller';
import { RefundsController } from 'src/refunds/refunds.controller';
import { DERECHO_KEY } from '../derecho.decorator';
import type { Derecho } from '../derechos';

/**
 * LA MATRIZ DE DERECHOS (14-09-2026, paso 3.2 del roadmap de venta).
 *
 * Hermana de `matriz-de-cargos.spec.ts`: aquella cuida que ninguna ruta
 * quede sin cargo, esta cuida que ninguna función de un plan superior
 * quede sin candado de plan.
 *
 * Lee los decoradores REALES de los controllers, no una copia. Si alguien
 * saca un `@Derecho` sin querer, o abre una ruta que no debía, esta prueba
 * se pone roja antes de que el cliente lo note.
 *
 * Lo que esta prueba NO puede ver: las revisiones que viven dentro de los
 * servicios, porque dependen de los datos (cuántas cotizaciones lleva el
 * mes, si el cliente ya tenía un contacto, de qué empresa es el token del
 * portal). Esas están listadas abajo, a mano, y cada una tiene su propia
 * prueba en el módulo que le corresponde.
 */

// Lo que se revisa POR DENTRO, no en la puerta. Cambiar esta lista sin
// mover el código deja el sistema mintiendo: cada línea nombra su prueba.
const REVISADAS_EN_EL_SERVICIO = [
  'cotizaciones_mes  → QuotationsService.create (derechos-del-plan.spec)',
  'varios_dias       → QuotationsService.create y update (derechos-del-plan.spec)',
  'encuestas         → QuotationsService.markEventDone (derechos-del-plan.spec)',
  'consultas         → QuotationsService.createPublic, el embudo',
  'portal            → QuotationsService, las tres puertas del portal',
  'clientes_360      → ClientContactsController.create, el segundo contacto',
  'usuarios_max      → UsersService.create',
  'dashboard_2       → AnalyticsService.getDashboardStats recorta la caja',
  'correos_automaticos → quotations-cron, el seguimiento de los 7 y 14 días',
  'post_venta        → payments-cron, la cobranza',
  'marketing         → marketing-cron, las campañas programadas',
];

const metodos: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
};

type Fila = { via: string; derecho: Derecho | null | undefined };

const rutasDe = (cls: new (...args: never[]) => object): Fila[] => {
  const base = Reflect.getMetadata(PATH_METADATA, cls) as string;
  const deLaClase = Reflect.getMetadata(DERECHO_KEY, cls) as
    | Derecho
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
        | Derecho
        | null
        | undefined;
      const metodo = Reflect.getMetadata(METHOD_METADATA, h) as number;
      const ruta = Reflect.getMetadata(PATH_METADATA, h) as string;
      return {
        via: `${metodos[metodo] ?? metodo} /${base}${ruta && ruta !== '/' ? `/${ruta}` : ''}`,
        derecho: propio === undefined ? deLaClase : propio,
      };
    });
};

// Lo que cada controller tiene que exigir. La fuente es el documento de
// planes firmado por Felipe el 14-09 y el inventario ruta por ruta.
const ESPERADO: Array<{
  nombre: string;
  cls: new (...args: never[]) => object;
  derecho: Derecho;
  abiertas: number; // rutas con @Derecho(null), a propósito
}> = [
  {
    nombre: 'Calendario',
    cls: CalendarController,
    derecho: 'calendario',
    abiertas: 0,
  },
  {
    nombre: 'Pagos',
    cls: PaymentsController,
    derecho: 'post_venta',
    abiertas: 1,
  },
  {
    nombre: 'Reembolsos',
    cls: RefundsController,
    derecho: 'post_venta',
    abiertas: 0,
  },
  {
    nombre: 'Comprobantes del portal',
    cls: PortalReceiptsController,
    derecho: 'post_venta',
    abiertas: 1,
  },
  {
    nombre: 'Logística',
    cls: LogisticsController,
    derecho: 'logistica',
    abiertas: 0,
  },
  {
    nombre: 'Consultas',
    cls: ConsultasController,
    derecho: 'consultas',
    abiertas: 0,
  },
  {
    nombre: 'Tipos de evento',
    cls: EventTypesController,
    derecho: 'consultas',
    abiertas: 1,
  },
  {
    nombre: 'Encuestas',
    cls: CustomerSatisfactionSurveyController,
    derecho: 'encuestas',
    abiertas: 0,
  },
  {
    nombre: 'Eventia Móvil',
    cls: MovilController,
    derecho: 'movil',
    abiertas: 0,
  },
  {
    nombre: 'Personal',
    cls: PeopleController,
    derecho: 'personal',
    abiertas: 7,
  },
  {
    nombre: 'Marketing',
    cls: MarketingController,
    derecho: 'marketing',
    abiertas: 0,
  },
];

describe('la matriz de derechos', () => {
  for (const { nombre, cls, derecho, abiertas } of ESPERADO) {
    it(`${nombre}: cerrado con "${derecho}"${abiertas ? `, con ${abiertas} puerta(s) abierta(s) a propósito` : ''}`, () => {
      const rutas = rutasDe(cls);
      expect(rutas.length).toBeGreaterThan(0);

      const conCandado = rutas.filter((r) => r.derecho === derecho);
      const conNull = rutas.filter((r) => r.derecho === null);
      const huerfanas = rutas.filter(
        (r) => r.derecho !== derecho && r.derecho !== null,
      );

      // Ninguna ruta puede quedar sin decidir: o lleva el derecho del
      // controller, o está abierta a propósito con @Derecho(null).
      expect(huerfanas.map((r) => r.via)).toEqual([]);
      expect(conNull).toHaveLength(abiertas);
      expect(conCandado.length + conNull.length).toBe(rutas.length);
    });
  }

  it('Clientes: la ficha y los tipos se leen en todo plan; escribirlos es Clientes 360', () => {
    const rutas = rutasDe(ClientsController);
    const por = (via: string) => rutas.find((r) => r.via === via);

    // Medido el 14-09: el COTIZADOR pide los tipos al montar y la ficha
    // ES la pantalla de Clientes. Cerrarlas rompería el plan Cotiza, que
    // vende "Clientes básico: la ficha y sus datos de contacto".
    expect(por('GET /clients/types')?.derecho).toBeUndefined();
    expect(por('GET /clients/:id/summary')?.derecho).toBeUndefined();

    // Administrar los tipos sí es Clientes 360 (Gestiona y Cobra), y solo
    // se hace desde el panel de la lista de clientes.
    expect(por('POST /clients/types')?.derecho).toBe('clientes_360');
    expect(por('DELETE /clients/types/:id')?.derecho).toBe('clientes_360');
    expect(por('PATCH /clients/types/reorder')?.derecho).toBe('clientes_360');
  });

  it('Análisis es del nivel 2 del Dashboard; el panel del nivel 1 queda abierto', () => {
    const rutas = rutasDe(AnalyticsController);
    const por = (via: string) => rutas.find((r) => r.via === via);
    // La misma respuesta sirve a los dos niveles: el servicio recorta.
    expect(por('GET /analytics/dashboard')?.derecho).toBeUndefined();
    expect(por('GET /analytics/complete')?.derecho).toBe('dashboard_2');
  });

  it('las revisiones que viven en los servicios quedan anotadas', () => {
    // No es una comprobación técnica: es el recordatorio de que estas
    // once no se ven desde acá y tienen su prueba en otra parte.
    expect(REVISADAS_EN_EL_SERVICIO).toHaveLength(11);
  });
});
