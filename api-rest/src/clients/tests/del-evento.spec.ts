import { LogisticsController } from 'src/logistics/logistics.controller';
import { PaymentsController } from 'src/payments/payments.controller';
import { PeopleController } from 'src/people/people.controller';
import { QuotationFollowupsController } from 'src/quotation-followups/quotation-followups.controller';
import { EventDocumentsController } from 'src/quotations/event-documents.controller';
import { PortalReceiptsController } from 'src/quotations/portal-receipts.controller';
import { QuotationsController } from 'src/quotations/quotations.controller';
import { RefundsController } from 'src/refunds/refunds.controller';
import {
  DEL_EVENTO_KEY,
  type DondeEstaElEvento,
} from '../del-evento.decorator';

// CADA PUERTA QUE TOCA UN EVENTO DICE DE CUÁL ES (doc 22 §9, tandas 2 y 3:
// Post-Venta, Compras y la planificación de Personal). Si una se queda sin `@DelEvento`, un cargo con ese tipo de
// cliente apagado la podría abrir: esta lista es el candado. Una puerta
// nueva de un evento se agrega acá.

type ConMetodos = { prototype: object };
const PUERTAS: [ConMetodos, string, DondeEstaElEvento][] = [
  [PaymentsController, 'createPaymentPlan', { body: 'quotation_id' }],
  [PaymentsController, 'editarPlan', { body: 'quotation_id' }],
  [PaymentsController, 'createPaymentTransaction', { body: 'quotation_id' }],
  [
    PaymentsController,
    'createOverflowPaymentTransaction',
    { body: 'quotation_id' },
  ],
  [
    PaymentsController,
    'updatePaymentTransaction',
    { tabla: 'payment_transactions', param: 'id' },
  ],
  [
    PaymentsController,
    'updatePaymentSchedule',
    { tabla: 'payments', param: 'id' },
  ],
  [PaymentsController, 'removePayment', { tabla: 'payments', param: 'id' }],
  [
    PaymentsController,
    'removePaymentTransaction',
    { tabla: 'payment_transactions', param: 'id' },
  ],
  [RefundsController, 'findByQuotation', { query: 'quotationId' }],
  [RefundsController, 'register', { tabla: 'refunds', param: 'id' }],
  [RefundsController, 'registrar', { body: 'quotation_id' }],
  [RefundsController, 'eliminar', { tabla: 'refunds', param: 'id' }],
  [
    PortalReceiptsController,
    'confirm',
    { tabla: 'portal_receipts', param: 'id' },
  ],
  [
    PortalReceiptsController,
    'reject',
    { tabla: 'portal_receipts', param: 'id' },
  ],
  [EventDocumentsController, 'findByQuotation', { query: 'quotationId' }],
  [EventDocumentsController, 'add', { body: 'quotation_id' }],
  [
    EventDocumentsController,
    'delete',
    { tabla: 'event_documents', param: 'id' },
  ],
  [QuotationFollowupsController, 'findByQuotation', { param: 'quotationId' }],
  [QuotationFollowupsController, 'create', { body: 'quotation_id' }],
  [
    QuotationFollowupsController,
    'update',
    { tabla: 'quotation_followups', param: 'id' },
  ],
  [
    QuotationFollowupsController,
    'remove',
    { tabla: 'quotation_followups', param: 'id' },
  ],
  [QuotationsController, 'markEventDone', { param: 'id' }],
  [QuotationsController, 'unmarkEventDone', { param: 'id' }],
  // La cosecha del mes, en el Dashboard (doc 22 §4.3, 06-11-2026).
  [QuotationsController, 'setHarvestStatus', { param: 'id' }],
  [LogisticsController, 'quotationProvisioning', { param: 'quotationId' }],
  [LogisticsController, 'eventResources', { query: 'quotationId' }],
  [
    LogisticsController,
    'addEventResources',
    { filas: 'rows', campo: 'quotation_id' },
  ],
  [
    LogisticsController,
    'updateEventResource',
    { tabla: 'event_resources', param: 'id' },
  ],
  [
    LogisticsController,
    'deleteEventResource',
    { tabla: 'event_resources', param: 'id' },
  ],
  [LogisticsController, 'serviceTimes', { query: 'quotationId' }],
  [LogisticsController, 'setServiceTime', { body: 'quotation_id' }],
  [LogisticsController, 'kitchenNotes', { query: 'quotationId' }],
  [LogisticsController, 'addKitchenNote', { body: 'quotation_id' }],
  [
    LogisticsController,
    'deleteKitchenNote',
    { tabla: 'event_kitchen_notes', param: 'id' },
  ],
  [LogisticsController, 'dayPrints', { query: 'quotationId' }],
  [LogisticsController, 'markDaysPrinted', { body: 'quotation_id' }],
  // Tanda 3: Compras y la planificación de Personal.
  [LogisticsController, 'markProvisioned', { filas: 'entries', campo: 'id' }],
  [LogisticsController, 'clearProvisioned', { body: 'ids' }],
  [
    LogisticsController,
    'upsertSupplyProvisions',
    { filas: 'rows', campo: 'quotation_id' },
  ],
  [LogisticsController, 'deleteSupplyProvisions', { body: 'quotationIds' }],
  [PeopleController, 'traerPlanta', { param: 'quotationId' }],
  [PeopleController, 'upsertSheet', { body: 'quotation_id' }],
  [PeopleController, 'cerrarFicha', { body: 'quotation_id' }],
  [PeopleController, 'findStaff', { query: 'evento' }],
  [PeopleController, 'addStaff', { body: 'quotation_id' }],
  [PeopleController, 'updateStaff', { tabla: 'event_staff', param: 'id' }],
  [PeopleController, 'removeStaff', { tabla: 'event_staff', param: 'id' }],
];

describe('@DelEvento en las puertas de Post-Venta', () => {
  it.each(
    PUERTAS.map(([controlador, metodo, donde]) => ({
      nombre: `${controlador.prototype.constructor.name}.${metodo}`,
      handler: (controlador.prototype as Record<string, unknown>)[metodo],
      donde,
    })),
  )('$nombre dice de qué evento es', ({ handler, donde }) => {
    expect(typeof handler).toBe('function');
    expect(Reflect.getMetadata(DEL_EVENTO_KEY, handler as object)).toEqual(
      donde,
    );
  });
});
