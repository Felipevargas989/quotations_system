import type { PinoLogger } from 'nestjs-pino';
import type { PaymentsService } from 'src/payments/payments.service';
import type { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { AceptarLaGanadaService } from '../postulacion/aceptar-la-ganada.service';
import type { PostulacionRepository } from '../postulacion/postulacion.repository';

// LA COTIZACIÓN DE UNA LICITACIÓN GANADA QUEDA ACEPTADA (decisión 104,
// 28-10). Felipe: "si esta ganada la licitación la cotización debe quedar
// como aceptada con un plan de pagos a 30 dias post realización del
// evento". Como la N° 679 de la 1030177-85-COT26, que él aceptó a mano.

const LA_679 = {
  id: 'q-679',
  quotation_number: 679,
  quotation_status: 'enviada',
  event_date: '2026-10-28T00:00:00+00:00',
  event_end_date: null,
  total_amount: 1_136_500,
};

function armar(cotizacion: Record<string, unknown> | null = LA_679) {
  const repo = { cotizacion: jest.fn().mockResolvedValue(cotizacion) };
  const pagos = { createPaymentPlan: jest.fn().mockResolvedValue(undefined) };
  const bitacora = { crearComoAsistente: jest.fn().mockResolvedValue({}) };
  const servicio = new AceptarLaGanadaService(
    repo as unknown as PostulacionRepository,
    pagos as unknown as PaymentsService,
    bitacora as unknown as QuotationFollowupsService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, pagos, bitacora, servicio };
}

describe('La cotización de una ganada queda aceptada', () => {
  it('con una cuota por el total a 30 días del servicio, sin el correo del plan al comprador (la N° 679)', async () => {
    const { repo, pagos, bitacora, servicio } = armar();
    await expect(
      servicio.aceptar(1, 'q-679', '1030177-85-COT26'),
    ).resolves.toEqual({ numero: 679, vence: '2026-11-27', total: 1_136_500 });
    expect(repo.cotizacion).toHaveBeenCalledWith(1, { id: 'q-679' });
    expect(pagos.createPaymentPlan).toHaveBeenCalledWith(
      {
        quotation_id: 'q-679',
        payments: [
          {
            payment_type: 'Cuota 1',
            amount: 1_136_500,
            due_date: '2026-11-27',
            notes: 'Licitación 1030177-85-COT26: a 30 días del servicio.',
          },
        ],
      },
      1,
      { sinCorreo: true },
    );
    // En su bitácora, a nombre del Asistente.
    expect(bitacora.crearComoAsistente).toHaveBeenCalledWith(1, {
      quotation_id: 'q-679',
      tipo: 'otro',
      next_contact_date: null,
      note: expect.stringContaining(
        'Aceptada sola: la licitación 1030177-85-COT26 salió ganada. Una cuota por el total',
      ) as string,
    });
  });

  it('de varios días, la cuota vence 30 días después del último', async () => {
    const { pagos, servicio } = armar({
      ...LA_679,
      event_date: '2026-11-25',
      event_end_date: '2026-12-19',
    });
    await servicio.aceptar(1, 'q-679', '1346350-11-LE26');
    expect(
      (pagos.createPaymentPlan.mock.calls[0] as [{ payments: unknown[] }])[0]
        .payments,
    ).toEqual([expect.objectContaining({ due_date: '2027-01-18' })]);
  });

  it('lo que ya es un evento, lo anulado o rechazado y lo que no tiene fecha ni total quedan como están', async () => {
    for (const quotation_status of [
      'aceptada',
      'realizada',
      'cancelada',
      'rechazada',
    ]) {
      const { pagos, servicio } = armar({ ...LA_679, quotation_status });
      await expect(servicio.aceptar(1, 'q-679', 'X')).resolves.toBeNull();
      expect(pagos.createPaymentPlan).not.toHaveBeenCalled();
    }
    for (const sinAlgo of [{ event_date: null }, { total_amount: 0 }]) {
      const { pagos, servicio } = armar({ ...LA_679, ...sinAlgo });
      await expect(servicio.aceptar(1, 'q-679', 'X')).resolves.toBeNull();
      expect(pagos.createPaymentPlan).not.toHaveBeenCalled();
    }
    const { servicio } = armar(null);
    await expect(servicio.aceptar(1, 'q-679', 'X')).resolves.toBeNull();
  });

  it('si el plan no se puede armar, no lanza', async () => {
    const { pagos, bitacora, servicio } = armar();
    pagos.createPaymentPlan.mockRejectedValue(new Error('el total cambió'));
    await expect(servicio.aceptar(1, 'q-679', 'X')).resolves.toBeNull();
    expect(bitacora.crearComoAsistente).not.toHaveBeenCalled();
  });
});
