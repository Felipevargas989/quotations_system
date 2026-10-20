import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import 'reflect-metadata';
import { CalendarController } from 'src/calendar/calendar.controller';
import { ClientContactsController } from 'src/clients/client-contacts.controller';
import { ClientsController } from 'src/clients/clients.controller';
import { ConsultasController } from 'src/consultas/consultas.controller';
import { EventTypesController } from 'src/consultas/event-types.controller';
import { CustomerSatisfactionSurveyController } from 'src/customer_satisfaction_survey/controller';
import { MovilController } from 'src/movil/movil.controller';
import { OportunidadesController } from 'src/oportunidades/oportunidades.controller';
import { PaymentsController } from 'src/payments/payments.controller';
import { PeopleController } from 'src/people/people.controller';
import { PortalReceiptsController } from 'src/quotations/portal-receipts.controller';
import { QuotationsController } from 'src/quotations/quotations.controller';
import { ServiceGroupCollectionsController } from 'src/service-group-collections/service-group-collections.controller';
import { ServiceGroupsController } from 'src/service-groups/service-groups.controller';
import { ServicesController } from 'src/services/services.controller';
import { StorageController } from 'src/storage/storage.controller';
import { UsersController } from 'src/users/users.controller';
import { IS_PUBLIC_KEY } from '../public.decorator';
import {
  ADMIN_ONLY,
  OPERATIONS_AND_UP,
  RECEPTION_AND_UP,
  ROLES_KEY,
  SALES_AND_UP,
} from '../roles.decorator';

/**
 * LA MATRIZ DE CARGOS DEL MOTOR (14-09-2026, paso 2 del roadmap de venta).
 *
 * Antes, 113 rutas del motor solo pedían estar logueado y confiaban en que
 * la pantalla escondiera lo que no correspondía. Esta prueba lee los
 * decoradores reales de cada controlador y verifica dos cosas: que las
 * rutas decididas con Felipe tengan exactamente el cargo acordado, y que
 * en estos controladores no quede NINGUNA ruta sin cargo, salvo las que se
 * dejan a propósito solo con sesión (ver `soloSesion`).
 */
type Clase = abstract new (...args: never[]) => unknown;
const verbo = (m: number) => RequestMethod[m];
const rutasDe = (cls: Clase) => {
  const proto = cls.prototype as Record<string, unknown>;
  const rutas: { clave: string; roles?: string[]; publica: boolean }[] = [];
  for (const nombre of Object.getOwnPropertyNames(proto)) {
    const h = proto[nombre];
    if (typeof h !== 'function' || nombre === 'constructor') continue;
    const path = Reflect.getMetadata(PATH_METADATA, h) as string | undefined;
    if (path === undefined) continue;
    const metodo = Reflect.getMetadata(METHOD_METADATA, h) as number;
    const roles =
      (Reflect.getMetadata(ROLES_KEY, h) as string[] | undefined) ??
      (Reflect.getMetadata(ROLES_KEY, cls) as string[] | undefined);
    const publica = Boolean(
      Reflect.getMetadata(IS_PUBLIC_KEY, h) ??
        Reflect.getMetadata(IS_PUBLIC_KEY, cls),
    );
    const p = path === '/' ? '' : path;
    rutas.push({ clave: `${verbo(metodo)} ${p}`, roles, publica });
  }
  return rutas;
};
const R = RECEPTION_AND_UP,
  S = SALES_AND_UP,
  O = OPERATIONS_AND_UP,
  A = ADMIN_ONLY;

const esperado: [Clase, Record<string, string[]>][] = [
  [
    QuotationsController,
    {
      'POST ': R,
      'GET ': R,
      'GET check-conflicts': R,
      'POST :id/enviar-correo': S,
      'POST :id/generar': S,
      // «✉ Generar seguimiento» (doc 18, 17-10-2026): quien vende.
      'GET seguimiento/pendientes': S,
      'POST :id/seguimiento': S,
      // Y la revisión de si el borrador ya salió (doc 18 §9).
      'POST seguimiento/revisar': S,
      // Choques de fecha (mapa 02 §5.6): la lista la ve el tablero; decidir
      // es de quien vende.
      'GET choques/pendientes': R,
      'POST :id/choques/:aceptadaId': S,
      'POST :id/cosecha': S,
      'PATCH :id': R,
      'DELETE :id': R,
    },
  ],
  [
    ConsultasController,
    {
      'GET ': R,
      'GET config': R,
      'PUT config/:eventType': A,
      'POST :id/convertir': R,
      'POST :id/descartar': R,
    },
  ],
  [
    EventTypesController,
    { 'GET ': R, 'POST ': A, 'PATCH :id': A, 'DELETE :id': A },
  ],
  [
    ClientsController,
    {
      'GET types': R,
      'POST types': S,
      'DELETE types/:id': S,
      'PATCH types/reorder': S,
      // El aviso de cliente parecido mientras se escribe (16-10-2026):
      // el mismo cargo que crear un cliente.
      'POST coincidencias': R,
      'POST ': R,
      'GET ': R,
      'GET :id/summary': R,
      'PATCH :id': S,
      'DELETE :id': S,
    },
  ],
  [
    ClientContactsController,
    {
      'GET ': R,
      'POST ': R,
      'PATCH :id': S,
      'DELETE :id': S,
      'POST :id/primary': S,
    },
  ],
  [PaymentsController, { 'GET ': R, 'GET transactions': O }],
  [PortalReceiptsController, { 'GET ': O }],
  [
    ServicesController,
    { 'GET ': S, 'GET used-codes': A, 'GET fixed-sections': S },
  ],
  [ServiceGroupsController, { 'GET ': S }],
  [ServiceGroupCollectionsController, { 'GET ': S }],
  [
    PeopleController,
    {
      'GET staff': O,
      'POST staff': O,
      'PATCH staff/:id': O,
      'DELETE staff/:id': O,
      'GET sheets': O,
      'GET ': A,
      'GET payrolls': A,
      'GET costo-personal': A,
    },
  ],
  [CalendarController, { 'GET events': R }],
  [
    StorageController,
    { 'POST upload': R, 'GET signed-url': R, 'POST delete': O },
  ],
  [UsersController, { 'GET ': A }],
  [CustomerSatisfactionSurveyController, { 'GET answers': A }],
  [
    MovilController,
    { 'GET push/clave-publica': O, 'POST cocina/:quotationId/marcas': O },
  ],
  [
    OportunidadesController,
    {
      'GET ': A,
      'GET config': A,
      'PATCH config': A,
      'POST radar': A,
      'GET radar/corridas': A,
      'GET mias': A,
      'GET calendario': A,
      'GET competidores': A,
      'GET competidores/:rut': A,
      'GET oferente': A,
      'PATCH oferente': A,
      'POST oferente/firma': A,
      'DELETE oferente/firma': A,
      'POST oferente/documentos': A,
      'PATCH oferente/documentos/:documentoId/siempre': A,
      'DELETE oferente/documentos/:documentoId': A,
      'GET :id': A,
      'PATCH :id': A,
      'GET :id/adjuntos': A,
      'POST :id/adjuntos': A,
      'DELETE :id/adjuntos/:adjuntoId': A,
      'GET :id/analisis': A,
      'POST :id/analisis': A,
      'GET :id/validacion': A,
      'POST :id/validacion': A,
      'GET :id/generaciones': A,
      'POST :id/generaciones/anexos': A,
      'POST :id/generaciones/firma': A,
      'POST :id/generaciones/propuesta': A,
    },
  ],
];

// Solo sesión a propósito: el propio perfil, la propia clave y la propia
// empresa (verificadas contra la sesión dentro del controller).
const soloSesion = new Set(['GET :id', 'PATCH password']);

describe('La matriz de cargos del motor', () => {
  for (const [cls, mapa] of esperado) {
    describe(cls.name, () => {
      const rutas = rutasDe(cls);
      for (const [clave, roles] of Object.entries(mapa)) {
        it(`${clave} → ${roles.join('/')}`, () => {
          const r = rutas.find((x) => x.clave === clave);
          expect(r).toBeDefined();
          expect(r?.roles).toEqual(roles);
        });
      }
      it('ninguna ruta queda solo con sesión', () => {
        const sueltas = rutas
          .filter((r) => !r.publica && !r.roles)
          .map((r) => r.clave)
          .filter((c) => !(cls === UsersController && soloSesion.has(c)));
        expect(sueltas).toEqual([]);
      });
    });
  }
});
