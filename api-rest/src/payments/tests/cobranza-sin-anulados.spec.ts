import type { PinoLogger } from 'nestjs-pino';
import type { DerechosService } from 'src/auth/derechos.service';
import type { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import type { UsersService } from 'src/users/users.service';
import { mockPinoLogger } from '../../testing/mocks';
import { PaymentStatus } from '../constants';
import { PaymentsCronService } from '../payments-cron.service';
import type { PaymentsRepository } from '../payments.repository';

// UN EVENTO ANULADO NO SE COBRA (Felipe, 22-10-2026: "ok hazlo"; mapa 03
// §F). La #465 (un colegio) quedó anulada con su cuota 3 viva y el reloj
// de las 11 le iba a mandar un cobro de $1.394.000 el 04-11, cuando lo
// que corresponde es devolverle lo abonado. Datos de prueba.

const pago = (n: number, quotation_status: string) => ({
  id: n,
  payment_number: 3,
  amount: '1394000',
  due_date: '2026-11-07',
  status: 'pendiente',
  payment_transactions: [],
  quotations: {
    company_id: 1,
    quotation_number: n,
    quotation_status,
    mandante: {
      name: 'Mandante de prueba',
      email: 'mandante@ejemplo.cl',
      portal_token: 'token',
    },
    clients: { name: 'Cliente de prueba', email: null },
    companies: { name: 'Empresa de prueba' },
  },
});

const armar = () => {
  const repositorio = {
    findAllPaymentsWithTransactions: jest.fn().mockResolvedValue({
      data: [pago(465, 'cancelada'), pago(500, 'aceptada')],
      error: null,
    }),
  };
  const email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const usuarios = {
    findAll: jest.fn().mockResolvedValue([{ email: 'admin@ejemplo.cl' }]),
  };
  const derechos = {
    deEmpresa: jest.fn().mockResolvedValue({ derechos: ['post_venta'] }),
  };
  const reloj = new PaymentsCronService(
    repositorio as unknown as PaymentsRepository,
    email as unknown as EmailService,
    usuarios as unknown as UsersService,
    mockPinoLogger() as unknown as PinoLogger,
    derechos as unknown as DerechosService,
  );
  return { reloj, email };
};

/** Los N° de cotización a los que salió algún correo. */
const cobradas = (email: { sendEmail: jest.Mock }) =>
  (email.sendEmail.mock.calls as unknown[][]).map(
    (llamada) => (llamada[2] as { quotationId: string }).quotationId,
  );

describe('PaymentsCronService: un evento anulado no se cobra', () => {
  it('el recordatorio sale solo a la aceptada, al mandante y a los administradores', async () => {
    const { reloj, email } = armar();
    await reloj.checkUpcomingOrOverduePayments(
      PaymentStatus.PENDIENTE,
      [3, 0],
      EmailStructure.PAYMENT_REMINDER,
    );
    expect(cobradas(email)).toEqual(['500', '500']);
  });

  it('el aviso de vencida tampoco le escribe a la anulada', async () => {
    const { reloj, email } = armar();
    await reloj.checkUpcomingOrOverduePayments(
      PaymentStatus.VENCIDO,
      [-7],
      EmailStructure.PAYMENT_OVERDUE,
    );
    expect(cobradas(email)).not.toContain('465');
    expect(cobradas(email)).toHaveLength(2);
  });
});
