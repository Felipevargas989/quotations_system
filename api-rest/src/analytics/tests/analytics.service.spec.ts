import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { ClientsService } from 'src/clients/clients.service';
import { PaymentsService } from 'src/payments/payments.service';
import { QuotationsService } from 'src/quotations/quotations.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import { fechaDelUltimoAbono } from '../../payments/payments.service';
import { mockPinoLogger, provideMock } from '../../testing/mocks';
import { AnalyticsService } from '../analytics.service';

// Esqueleto reparado (Fase 2 Bloque B): arma el módulo con las
// dependencias REALES de la clase, todas mockeadas. Verifica que la
// clase se pueda construir; las pruebas de comportamiento se agregan
// cuando se toque este módulo.
describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        provideMock(QuotationsService),
        provideMock(ClientsService),
        provideMock(PaymentsService),
        provideMock(SupabaseService),
        { provide: PinoLogger, useValue: mockPinoLogger() },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

describe('el mes del cobro (28-08): manda el ÚLTIMO abono', () => {
  // La regla que arregló el gráfico "cobrado por mes": antes, sin
  // paid_date se usaba el VENCIMIENTO y la plata caía en el mes
  // equivocado (55 cuotas, $101M medidos en producción).
  const mesDeCobro = (p: {
    status: string;
    paid_date: string | null;
    due_date: string;
    payment_transactions?: { transaction_date: string }[];
  }) => {
    const isPaid = p.status === 'pagado';
    const fecha =
      fechaDelUltimoAbono(p.payment_transactions ?? []) ?? p.paid_date;
    return (isPaid && fecha ? fecha : p.due_date).slice(0, 7);
  };

  it('cuota pagada tarde: cuenta en el mes del abono, no en el del vencimiento', () => {
    expect(
      mesDeCobro({
        status: 'pagado',
        paid_date: null,
        due_date: '2026-01-15',
        payment_transactions: [{ transaction_date: '2026-03-20' }],
      }),
    ).toBe('2026-03');
  });

  it('cuota vieja sin abonos: usa su fecha guardada (respaldo)', () => {
    expect(
      mesDeCobro({
        status: 'pagado',
        paid_date: '2025-06-10',
        due_date: '2025-05-01',
      }),
    ).toBe('2025-06');
  });

  it('cuota aún no pagada: sigue contando por su vencimiento', () => {
    expect(
      mesDeCobro({
        status: 'pendiente',
        paid_date: null,
        due_date: '2026-12-01',
      }),
    ).toBe('2026-12');
  });
});
