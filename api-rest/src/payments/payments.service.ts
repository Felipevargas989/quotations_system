import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PostgrestError } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { QuotationsService } from 'src/quotations/quotations.service';
import { PaymentStatus } from './constants';
import {
  CuotaDelPlan,
  PiezaDePago,
  cobertura,
  hoyEnChile,
  planDeLlenado,
  repartirAlza,
  repartirRebaja,
} from './cuotas-que-se-llenan';
import { CreateOverflowTransactionDto } from './dto/create-overflow-transaction.dto';
import { CreatePaymentPlanDto } from './dto/create-payment-plan.dto';
import { CreatePaymentTransactionDto } from './dto/create-payment-transaction.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentScheduleDto } from './dto/update-payment-schedule.dto';
import { UpdatePaymentTransactionDto } from './dto/update-payment-transaction.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { Payment, PaymentTransaction } from './entities/payment.entity';
import {
  CreatePayment,
  CreatePaymentTransaction,
  PaymentWithTransactionsAndQuotation,
  UpdatePayment,
} from './interfaces/payments.types';
import { PaymentsRepository } from './payments.repository';

/**
 * Service responsible for managing payment operations including
 * payment plans, transactions, and automated overdue payment updates.
 */
/**
 * LA FECHA DEL ÚLTIMO ABONO (28-08). Resuelve el TODO original
 * —"¿tiene sentido transacciones[0]? quizás necesita ordenarse"— que
 * llevaba ahí desde el principio: la consulta NO ordena, así que
 * tomar el primero mostraba la fecha del PRIMER abono. Medido ese día
 * en producción: de 52 cuotas pagadas en varios abonos, 38 mostraban
 * la fecha equivocada (la peor, 149 días antes de la real).
 *
 * Se calcula el MÁXIMO explícitamente en vez de confiar en el orden:
 * así sigue siendo correcto aunque alguien cambie la consulta. Las
 * fechas son ISO (YYYY-MM-DD…), que comparan bien como texto.
 */
export const fechaDelUltimoAbono = (
  transacciones: readonly { transaction_date: string }[],
): string | null =>
  transacciones.reduce<string | null>(
    (ultima, t) =>
      !ultima || t.transaction_date > ultima ? t.transaction_date : ultima,
    null,
  );

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly quotationsRepository: QuotationsRepository,
    @Inject(forwardRef(() => QuotationsService))
    private readonly quotationsService: QuotationsService,
    private readonly emailService: EmailService,
    private readonly logger: PinoLogger,
  ) {}
  /**
   * Creates a payment plan for a quotation.
   * Deletes existing payments, creates new ones, and updates quotation status to 'aceptada'.
   *
   * @param createPaymentPlanDto - The payment plan details
   * @param companyId - The company ID
   * @returns {Promise<void>}
   */
  async createPaymentPlan(
    createPaymentPlanDto: CreatePaymentPlanDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `createPaymentPlan with createPaymentPlanDto ${JSON.stringify(createPaymentPlanDto)}`,
    );
    // 0. EL PORTERO DEL PLAN (caso 501, 06-09): la suma de las cuotas
    // debe calzar AL PESO con el total ACTUAL de la cotización. La
    // pantalla cuadra contra el total que VE — y ese puede ser viejo
    // (la cuota de la 501 nació doblada porque la lista aún mostraba
    // el total de antes de corregir un tipeo). La cuenta la hace la
    // casa: acá, contra la base, no contra la memoria del navegador.
    const { data: quotation } = await this.quotationsService.findOne(
      createPaymentPlanDto.quotation_id,
    );
    if (!quotation || quotation.company_id !== companyId) {
      throw new NotFoundException('Cotización no encontrada');
    }
    const sumaCuotas = createPaymentPlanDto.payments.reduce(
      (s, p) => s + Math.round(p.amount || 0),
      0,
    );
    const totalActual = Math.round(Number(quotation.total_amount || 0));
    if (sumaCuotas !== totalActual) {
      throw new BadRequestException(
        `Las cuotas suman $${sumaCuotas.toLocaleString('es-CL')} pero la cotización vale $${totalActual.toLocaleString(
          'es-CL',
        )}. El total pudo cambiar hace poco: recarga la página y arma el plan de nuevo.`,
      );
    }

    // 1. Delete existing payments
    await this.paymentsRepository.deletePaymentsByQuotationId(
      createPaymentPlanDto.quotation_id,
      companyId,
    );

    // 2. Create new payments
    await this.paymentsRepository.createPaymentPlan(
      createPaymentPlanDto.payments,
    );

    // 4. Send email to client with payment plan details
    try {
      if (
        quotation &&
        quotation.quotation_status !== QuotationStatus.ACEPTADA
      ) {
        // Correos a personas y punto (30-07): solo al mandante; sin
        // persona con correo, no se envía (queda en el log).
        const mandante = await this.quotationsService.mandanteOf(
          quotation.client_contact_id,
        );
        if (!mandante?.email) {
          this.logger.warn(
            `PAYMENT_PLAN_CREATED sin destinatario: cotización ${quotation.quotation_number} sin mandante con correo`,
          );
        } else {
          void this.emailService.sendEmail(
            mandante.email,
            EmailStructure.PAYMENT_PLAN_CREATED,
            {
              clientName: mandante.name,
              companyName: quotation.companies.name,
              quotationNumber: quotation.quotation_number,
              payments: createPaymentPlanDto.payments.map((payment) => ({
                payment_number: payment.payment_number,
                amount: payment.amount,
                due_date: payment.due_date,
              })),
            },
            companyId,
            mandante.portalToken || null,
          );
        }
      }
    } catch (error) {
      // Do not throw error, just log it
      this.logger.error(error);
    }

    // 5. Update the quotation status to 'aceptada'
    // PUERTA DE ATRÁS TAPADA (13-08): esta escritura era incondicional,
    // así que rehacer el plan de cobranza de un evento YA REALIZADO lo
    // des-realizaba en silencio, saltándose la llave. Rehacer el plan
    // sigue permitido —la cobranza no se congela, puede faltar cobrar—;
    // lo que no puede es devolver el evento a "aceptada".
    if (quotation?.quotation_status !== QuotationStatus.REALIZADA) {
      await this.quotationsRepository.update(
        createPaymentPlanDto.quotation_id,
        { quotation_status: QuotationStatus.ACEPTADA },
        companyId,
      );
    }
  }

  async createPayment(
    createPaymentDto: CreatePaymentDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `createPayment with createPaymentDto ${JSON.stringify(createPaymentDto)}`,
    );

    try {
      let nextPaymentNumber: number = 1;

      // 1. Get the next payment number for this payment
      const { data: payments, error: paymentsError } =
        await this.paymentsRepository.findAllPaymentsFromQuotation(
          [createPaymentDto.quotation_id],
          companyId,
        );
      if (paymentsError) {
        this.logger.error(paymentsError);
        throw paymentsError;
      }
      if (payments && payments.length > 0) {
        nextPaymentNumber = payments[payments.length - 1].payment_number + 1;
      }

      // 2. Set due_date
      // Calculate due_date: if event_date exists, use 1 week after event date; otherwise use today
      const { data: quotation, error: quotationError } =
        await this.quotationsRepository.findOne(createPaymentDto.quotation_id);
      if (quotationError) {
        this.logger.error(quotationError);
        throw quotationError;
      }

      if (!quotation) {
        this.logger.error('Quotation not found');
        throw new Error('Quotation not found');
      }

      const dueDate = quotation.event_date
        ? new Date(quotation.event_date).getTime() + 7 * 24 * 60 * 60 * 1000
        : new Date().getTime();

      // 3. create payment
      const newPayment: CreatePayment = {
        quotation_id: createPaymentDto.quotation_id,
        amount: createPaymentDto.amount,
        notes: createPaymentDto.notes,
        status: PaymentStatus.PENDIENTE,
        payment_number: nextPaymentNumber,
        due_date: new Date(dueDate),
      };

      return this.paymentsRepository.createPayment(newPayment);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  // Elimina el plan de pagos completo de una cotización. Solo se usa cuando
  // NO hay dinero registrado (guardia de estados en QuotationsService.update):
  // volver una cotización a pre-venta no debe dejar cuotas huérfanas.
  deletePaymentPlan(quotationId: Quotation['id'], companyId: Company['id']) {
    this.logger.info(
      `deletePaymentPlan for quotation ${quotationId} (state guard)`,
    );
    return this.paymentsRepository.deletePaymentsByQuotationId(
      quotationId,
      companyId,
    );
  }

  /**
   * CUOTAS QUE SE LLENAN (doc 14): el plan tal como está — las cuotas,
   * con su marca de "pagada por fuera", y TODAS las piezas de pago.
   */
  private async leerPlan(
    quotationId: Quotation['id'],
    companyId: Company['id'],
  ) {
    const { data, error } =
      await this.paymentsRepository.findAllPaymentsFromQuotation(
        [quotationId],
        companyId,
      );
    if (error) throw error;
    const filas = data || [];
    const cuotas = filas.map((c) => ({
      id: c.id,
      payment_number: c.payment_number,
      amount: c.amount,
      due_date: c.due_date as unknown as string,
      status: c.status,
      // Pagada por fuera: marcada pagada, con un paid_date escrito por una
      // carga de datos y sin ningún pago registrado (40 el 08-10-2026,
      // todas de la empresa 52; ninguna de Valle del Sol). La regla no la
      // toca nunca.
      pagadaPorFuera:
        c.status === (PaymentStatus.PAGADO as string) &&
        Boolean(c.paid_date) &&
        (c.payment_transactions || []).length === 0,
    }));
    const piezas = filas.flatMap((c) =>
      (c.payment_transactions || []).map((t) => ({
        ...t,
        payment_id: c.id,
        quotation_id: quotationId,
        pago_grupo: t.pago_grupo ?? `solo-${t.id}`,
        transaction_date: t.transaction_date ?? null,
        created_at: t.created_at ? String(t.created_at) : null,
      })),
    );
    return { cuotas, piezas };
  }

  /**
   * Regla 3 del doc 14: vuelve a repartir lo pagado desde la primera
   * cuota y deja a cada cuota con su estado. `planDeLlenado` decide; acá
   * se ejecuta. Como todo se recalcula desde cero, un llenado que quedó a
   * medias (dos personas a la vez, un corte) lo arregla el siguiente.
   */
  private async aplicarLlenado(
    quotationId: Quotation['id'],
    cuotas: (CuotaDelPlan & { status: string })[],
    piezas: (PiezaDePago &
      Pick<
        Partial<PaymentTransaction>,
        'payment_method' | 'notes' | 'receipt_photo_url'
      >)[],
  ) {
    const plan = planDeLlenado(cuotas, piezas, hoyEnChile());
    for (const m of plan.actualizar) {
      const { error } = await this.paymentsRepository.moverPieza(m.id, {
        payment_id: m.payment_id,
        amount: m.amount,
      });
      if (error) throw error;
    }
    for (const n of plan.insertar) {
      // La pieza nueva es el MISMO pago: misma fecha, medio, nota,
      // comprobante y grupo que la pieza de la que sale.
      const base = piezas.find((p) => p.id === n.copiaDe);
      const grupo = base?.pago_grupo?.startsWith('solo-')
        ? undefined
        : base?.pago_grupo;
      const { error } = await this.paymentsRepository.createPaymentTransaction({
        payment_id: n.payment_id,
        quotation_id: quotationId,
        amount: n.amount,
        payment_method: base?.payment_method,
        transaction_date: base?.transaction_date,
        notes: base?.notes,
        receipt_photo_url: base?.receipt_photo_url,
        ...(grupo ? { pago_grupo: grupo } : {}),
      } as CreatePaymentTransaction);
      if (error) throw error;
    }
    if (plan.borrar.length > 0) {
      const { error } = await this.paymentsRepository.removeTransactionsByIds(
        plan.borrar,
      );
      if (error) throw error;
    }
    for (const e of plan.estados) {
      const antes = cuotas.find((c) => c.id === e.id);
      if (antes?.status === e.status) continue;
      const { error } = await this.paymentsRepository.updatePayment(e.id, {
        status: e.status,
        ...(e.cubierto <= 0 ? { paid_date: null as unknown as Date } : {}),
      });
      if (error) throw error;
    }
    return plan;
  }

  /** Regla 3 sobre el plan actual: después de registrar, corregir o
   *  borrar un pago. */
  async rellenarCuotas(quotationId: Quotation['id'], companyId: Company['id']) {
    const { cuotas, piezas } = await this.leerPlan(quotationId, companyId);
    return this.aplicarLlenado(quotationId, cuotas, piezas);
  }

  /**
   * CUOTAS QUE SE LLENAN (doc 14, Felipe 07-10-2026): cuando cambia el
   * total de una cotización aceptada, EL PLAN MANTIENE SU FORMA.
   * - Baja: todas las cuotas bajan en proporción a su monto, también las
   *   pagadas ("forma completa"); lo que les sobra pasa a la siguiente.
   * - Sube: crecen, en proporción a su monto, solo las cuotas por pagar
   *   que no han vencido (opción B: lo nuevo nunca nace vencido).
   * Después lo pagado se vuelve a repartir desde la primera. Devuelve lo
   * que no tuvo cuota donde ir — `reembolso` (al bajar) o `cuotaNueva`
   * (al subir) — y el llamador lo resuelve como siempre.
   *
   * Antes (hasta el 07-10-2026): la rebaja se descontaba desde la última
   * cuota y el alza se cargaba entera a la última; una cuota vaciada
   * quedaba en $0 (la 506).
   */
  async cambiarTotalDelPlan(
    quotationId: Quotation['id'],
    diferencia: number,
    companyId: Company['id'],
  ): Promise<{ reembolso: number; cuotaNueva: number }> {
    const { cuotas, piezas } = await this.leerPlan(quotationId, companyId);
    const pagado = piezas.reduce((s, p) => s + Number(p.amount), 0);
    const cambio =
      diferencia < 0
        ? repartirRebaja(cuotas, pagado, -diferencia)
        : repartirAlza(cuotas, pagado, diferencia, hoyEnChile());
    this.logger.info(
      `cambiarTotalDelPlan ${quotationId} diferencia ${diferencia}: ${JSON.stringify(cambio)}`,
    );

    for (const c of cambio.cambios) {
      const { error } = await this.paymentsRepository.updatePayment(c.id, {
        amount: c.amount,
      });
      if (error) throw error;
    }
    const quedan = cuotas
      .filter((c) => !cambio.borrar.includes(c.id))
      .map((c) => ({
        ...c,
        amount: cambio.cambios.find((x) => x.id === c.id)?.amount ?? c.amount,
      }));
    // Primero se mueven los pagos (la base no deja borrar una cuota con
    // pagos colgando) y recién después se borran las cuotas en $0.
    await this.aplicarLlenado(quotationId, quedan, piezas);
    if (cambio.borrar.length > 0) {
      for (const id of cambio.borrar) {
        const { error } = await this.paymentsRepository.removePayment(id);
        if (error) throw error;
      }
      await this.renumerarCuotas(quotationId, companyId);
    }
    return { reembolso: cambio.reembolso, cuotaNueva: cambio.cuotaNueva };
  }
  /** Deja las cuotas numeradas 1..n sin huecos, en su orden actual. */
  private async renumerarCuotas(
    quotationId: Quotation['id'],
    companyId: Company['id'],
  ) {
    const { data: todas, error } =
      await this.paymentsRepository.findAllPaymentsFromQuotation(
        [quotationId],
        companyId,
      );
    if (error) throw error;
    // De menor a mayor: cada número nuevo es menor o igual al anterior,
    // así que nunca pisa uno que todavía está ocupado.
    for (const [i, cuota] of (todas || []).entries()) {
      if (cuota.payment_number !== i + 1) {
        const { error: e } = await this.paymentsRepository.updatePayment(
          cuota.id,
          { payment_number: i + 1 },
        );
        if (e) throw e;
      }
    }
  }

  /**
   * Calendario de pagos, Nivel A: edita SOLO la fecha de vencimiento y
   * la nota de una cuota. Cuotas con dinero registrado (pagadas o con
   * abonos) son intocables por esta vía — para eso está rectificar el
   * registro. Si cambia la fecha, el estado se re-cuadra solo
   * (pendiente/vencido según el nuevo vencimiento).
   */
  async updatePaymentSchedule(
    paymentId: Payment['id'],
    dto: UpdatePaymentScheduleDto,
    companyId: Company['id'],
  ) {
    this.logger.info(`updatePaymentSchedule with paymentId ${paymentId}`);

    const { data: payment, error } =
      await this.paymentsRepository.findPaymentById(paymentId, companyId);
    if (error || !payment) {
      throw new NotFoundException('Cuota no encontrada');
    }

    const { data: transactions } =
      await this.paymentsRepository.findAllTransactionsByPaymentId(paymentId);
    const hasMoney =
      (payment.status as PaymentStatus) === PaymentStatus.PAGADO ||
      (transactions || []).length > 0;
    if (hasMoney) {
      throw new BadRequestException(
        'Esta cuota ya tiene dinero registrado: su fecha y nota no se pueden editar. Si el registro está mal, rectifícalo desde el calendario de pagos.',
      );
    }

    const fields: UpdatePayment = {};
    if (dto.due_date !== undefined) {
      fields.due_date = dto.due_date as unknown as Payment['due_date'];
      const hoy = hoyEnChile();
      fields.status =
        dto.due_date < hoy ? PaymentStatus.VENCIDO : PaymentStatus.PENDIENTE;
    }
    if (dto.notes !== undefined) {
      fields.notes = dto.notes;
    }

    const { error: updateError } = await this.paymentsRepository.updatePayment(
      paymentId,
      fields,
    );
    if (updateError) throw updateError;

    return {
      updated: true,
      status: fields.status ?? payment.status,
    };
  }

  findAllPaymentsFromQuotation(
    quotationIds: Quotation['id'][],
    companyId: Company['id'],
    filterStatus?: PaymentStatus[],
  ): Promise<{
    data: PaymentWithTransactionsAndQuotation[] | null;
    error: PostgrestError | null;
  }> {
    return this.paymentsRepository.findAllPaymentsFromQuotation(
      quotationIds,
      companyId,
      filterStatus,
    );
  }

  async findAllPaymentsWithTransactions(companyId: Company['id']) {
    this.logger.info(
      `findAllPaymentsWithTransactions with companyId ${companyId}`,
    );
    const { data: payments, error } =
      await this.paymentsRepository.findAllPaymentsWithTransactions(companyId);

    if (error) {
      this.logger.error(error);
      throw new Error(error.message);
    }
    // get stats
    const paymentsWithTransactions = payments.map((payment) => {
      const transactions = payment.payment_transactions;
      const paid_amount = transactions.reduce(
        (sum: number, t: PaymentTransaction) => sum + Number(t.amount),
        0,
      );
      const payment_count = transactions.length;
      const last_payment_date = fechaDelUltimoAbono(transactions);

      // delete payment_transactions from payment object
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { payment_transactions, ...paymentWithoutTransactions } = payment;

      return {
        ...paymentWithoutTransactions,
        transactions,
        paid_amount,
        payment_count,
        last_payment_date,
      };
    });

    return paymentsWithTransactions;
  }

  /**
   * Registra un pago de una cotización. Desde las cuotas que se llenan
   * (doc 14) da lo mismo a qué cuota diga ir: lo pagado llena siempre
   * desde la primera, así que entra por la misma puerta que el derrame.
   * La usa el portal al confirmar un comprobante — y por eso ya no falla
   * si la cuota del comprobante cambió de monto o desapareció.
   */
  async createPaymentTransaction(
    dto: CreatePaymentTransactionDto,
    companyId: Company['id'],
  ) {
    return this.createOverflowPaymentTransaction(
      {
        quotation_id: dto.quotation_id,
        amount: dto.amount,
        payment_method: dto.payment_method,
        transaction_date: dto.transaction_date,
        notes: dto.notes,
        receipt_photo_url: dto.receipt_photo_url,
      },
      companyId,
    );
  }

  /**
   * Registra UN pago con "derrame": llena desde la primera cuota con
   * saldo y lo que sobra pasa a la siguiente. Desde las cuotas que se
   * llenan (doc 14) el pago entra como una sola pieza y `rellenarCuotas`
   * lo parte en las cuotas que toque; todas sus piezas comparten
   * `pago_grupo` (migración 118), así que se ve, se corrige y se borra
   * como uno solo. Un solo correo al cliente, con el total.
   */
  async createOverflowPaymentTransaction(
    dto: CreateOverflowTransactionDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `createOverflowPaymentTransaction with dto ${JSON.stringify(dto)}`,
    );
    const { cuotas, piezas } = await this.leerPlan(dto.quotation_id, companyId);
    const vivas = cuotas
      .filter((c) => !c.pagadaPorFuera)
      .sort((a, b) => a.payment_number - b.payment_number);
    if (vivas.length === 0) {
      throw new BadRequestException(
        'No hay cuotas pendientes para esta cotización',
      );
    }
    const montos = vivas.map((c) => Math.round(Number(c.amount)));
    const pagado = piezas.reduce((s, p) => s + Number(p.amount), 0);
    const saldo = montos.reduce((s, m) => s + m, 0) - pagado;
    if (dto.amount > saldo) {
      throw new BadRequestException(
        `El monto no puede exceder el saldo pendiente total (${saldo})`,
      );
    }

    // Cómo se reparte ESTE pago, desde la primera cuota con saldo (lo
    // que la pantalla ya le mostró al usuario en la vista previa).
    const cubre = cobertura(montos, pagado);
    let resto = dto.amount;
    const distribution: {
      payment_id: Payment['id'];
      payment_number: number;
      amount: number;
      fully_paid: boolean;
    }[] = [];
    vivas.forEach((c, i) => {
      const espacio = montos[i] - cubre[i];
      const toma = Math.min(resto, espacio);
      if (toma <= 0) return;
      distribution.push({
        payment_id: c.id,
        payment_number: c.payment_number,
        amount: toma,
        fully_paid: toma === espacio,
      });
      resto -= toma;
    });

    try {
      const { error: txError } =
        await this.paymentsRepository.createPaymentTransaction({
          payment_id: distribution[0]?.payment_id ?? vivas[0].id,
          quotation_id: dto.quotation_id,
          amount: dto.amount,
          payment_method: dto.payment_method,
          transaction_date: dto.transaction_date,
          notes: dto.notes,
          receipt_photo_url: dto.receipt_photo_url,
          pago_grupo: randomUUID(),
        } as CreatePaymentTransaction);
      if (txError) throw txError;
      await this.rellenarCuotas(dto.quotation_id, companyId);
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }

    // Un solo correo al cliente con el total.
    try {
      const { data: quotation } = await this.quotationsService.findOne(
        dto.quotation_id,
      );
      if (quotation) {
        // Correos a personas y punto (30-07): solo al mandante.
        const mandante = await this.quotationsService.mandanteOf(
          quotation.client_contact_id,
        );
        if (!mandante?.email) {
          this.logger.warn(
            `PAYMENT_RECEIVED sin destinatario: cotización ${quotation.quotation_number} sin mandante con correo`,
          );
        } else {
          void this.emailService.sendEmail(
            mandante.email,
            EmailStructure.PAYMENT_RECEIVED,
            {
              clientName: mandante.name,
              companyName: quotation.companies.name,
              amount: dto.amount,
              paymentMethod: dto.payment_method || '',
              transactionDate: dto.transaction_date || new Date(),
            },
            companyId,
            mandante.portalToken || null,
          );
        }
      }
    } catch (emailError) {
      // El pago ya quedó registrado: un correo que falla no lo deshace.
      this.logger.error(`Failed to send payment received email: ${emailError}`);
    }

    return { total: dto.amount, distribution };
  }

  /**
   * Rectificar un pago: fecha, medio, nota, comprobante o monto. Desde las
   * cuotas que se llenan (doc 14) se corrige el PAGO ENTERO aunque esté
   * repartido en varias cuotas, y un monto mayor ya no exige borrarlo y
   * registrarlo de nuevo: lo pagado se vuelve a repartir solo. El tope es
   * lo que falta pagar del evento.
   */
  async updatePaymentTransaction(
    paymentTransactionId: PaymentTransaction['id'],
    dto: UpdatePaymentTransactionDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `updatePaymentTransaction with id ${paymentTransactionId} and dto ${JSON.stringify(dto)}`,
    );
    const { data: tx } =
      await this.paymentsRepository.findPaymentTransactionById(
        paymentTransactionId,
      );
    if (!tx) throw new NotFoundException('Registro de pago no encontrado');
    // Aislamiento entre empresas: la cuota del registro debe ser de la
    // empresa de la sesión.
    const { data: cuota } = await this.paymentsRepository.findPaymentById(
      tx.payment_id,
      companyId,
    );
    if (!cuota) throw new NotFoundException('Registro de pago no encontrado');

    const { cuotas, piezas } = await this.leerPlan(tx.quotation_id, companyId);
    const grupo = piezas
      .filter((p) =>
        tx.pago_grupo ? p.pago_grupo === tx.pago_grupo : p.id === tx.id,
      )
      .sort((a, b) => a.id - b.id);
    const totalGrupo = grupo.reduce((s, p) => s + Number(p.amount), 0);
    const nuevoTotal =
      dto.amount !== undefined ? Math.round(Number(dto.amount)) : totalGrupo;
    if (nuevoTotal <= 0) {
      throw new BadRequestException('El monto debe ser mayor que cero.');
    }
    const totalCuotas = cuotas
      .filter((c) => !c.pagadaPorFuera)
      .reduce((s, c) => s + Math.round(Number(c.amount)), 0);
    const pagado = piezas.reduce((s, p) => s + Number(p.amount), 0);
    const maximo = totalCuotas - pagado + totalGrupo;
    if (nuevoTotal > maximo) {
      throw new BadRequestException(
        `El monto supera lo que falta pagar del evento (máximo $${maximo.toLocaleString('es-CL')}).`,
      );
    }

    // Fecha, medio, nota y comprobante: iguales en todas las piezas.
    const comunes: UpdatePaymentTransactionDto = { ...dto };
    delete comunes.amount;
    if (Object.keys(comunes).length > 0) {
      for (const p of grupo) {
        const { error } =
          await this.paymentsRepository.updatePaymentTransaction(p.id, comunes);
        if (error) throw error;
      }
    }
    // El monto: una sola pieza con el total nuevo; el llenado la reparte.
    if (nuevoTotal !== totalGrupo && grupo.length > 0) {
      const [primera, ...otras] = grupo;
      const { error } = await this.paymentsRepository.moverPieza(primera.id, {
        payment_id: primera.payment_id,
        amount: nuevoTotal,
      });
      if (error) throw error;
      if (otras.length > 0) {
        const { error: e } =
          await this.paymentsRepository.removeTransactionsByIds(
            otras.map((p) => p.id),
          );
        if (e) throw e;
      }
    }
    await this.rellenarCuotas(tx.quotation_id, companyId);
    return { ok: true };
  }

  // findOne(id: number) {
  //   return `This action returns a #${id} payment`;
  // }

  update(id: Payment['id'], updatePaymentDto: UpdatePaymentDto) {
    return this.paymentsRepository.updatePayment(id, updatePaymentDto);
  }
  /**
   * Borra un PAGO entero — todas sus piezas, aunque esté repartido en
   * varias cuotas — y vuelve a repartir lo que queda desde la primera
   * cuota (doc 14, caso 12: se abre la ÚLTIMA cuota que estaba cubierta,
   * no la del pago borrado). Las cuotas nunca se borran por esto.
   */
  async removePaymentTransaction(id: number, companyId: Company['id']) {
    this.logger.info(`removePaymentTransaction with id ${id}`);
    const { data: tx } =
      await this.paymentsRepository.findPaymentTransactionById(id);
    // Aislamiento entre empresas (11-09-2026): el registro se borra SOLO
    // si su cuota es de la empresa. Antes se borraba primero y recién
    // después se miraba la cuota, así que un id ajeno se llevaba el
    // abono de otra empresa.
    if (!tx) {
      throw new NotFoundException('Registro de pago no encontrado');
    }
    const { data: cuotaDeLaEmpresa } =
      await this.paymentsRepository.findPaymentById(tx.payment_id, companyId);
    if (!cuotaDeLaEmpresa) {
      throw new NotFoundException('Registro de pago no encontrado');
    }
    const { data: delGrupo } = tx.pago_grupo
      ? await this.paymentsRepository.findTransactionsByGroup(tx.pago_grupo)
      : { data: null };
    const ids = (delGrupo?.length ? delGrupo : [tx])
      .filter((p: PaymentTransaction) => p.quotation_id === tx.quotation_id)
      .map((p: PaymentTransaction) => p.id);
    const result = await this.paymentsRepository.removeTransactionsByIds(ids);
    if (result.error) throw result.error;
    await this.rellenarCuotas(tx.quotation_id, companyId);
    return result;
  }
  async removePayment(id: Payment['id'], companyId: Company['id']) {
    this.logger.info(`removePayment with id ${id} of company ${companyId}`);

    // Aislamiento entre empresas (11-09-2026): la cuota tiene que ser de
    // la empresa. `findPaymentById` verifica la pertenencia por su
    // cotización, con `!inner`.
    const { data: cuotaDeLaEmpresa } =
      await this.paymentsRepository.findPaymentById(id, companyId);
    if (!cuotaDeLaEmpresa) {
      throw new NotFoundException('Cuota no encontrada');
    }

    // 1. remove all payment_transactions related to the payment
    const { error } =
      await this.paymentsRepository.removePaymentTransactionsByPaymentId(id);

    if (error) {
      this.logger.error(error);
      throw error;
    }

    // 2. remove the payment by payment_id
    return this.paymentsRepository.removePayment(id);
  }

  /**
   * Reloj de la MEDIANOCHE DE CHILE (07-10-2026): pasa a `vencido` las
   * cuotas pendientes cuyo día ya pasó en Chile. Antes corría a la 1 AM
   * del servidor (UTC = 22:00 en Chile) y comparaba con la hora UTC: la
   * noche ANTES del vencimiento ya marcaba vencida la cuota (552, cuota
   * 2), y su correo de "vence hoy" no salía.
   */
  @Cron('5 0 * * *', { timeZone: 'America/Santiago' })
  async updateOverduePayments() {
    this.logger.info('CRON job to update overdue payments');
    try {
      // Update status of overdue payments to PENDIENTE
      const { data, error, status } =
        await this.paymentsRepository.updateOverduePayments();

      if (error) {
        this.logger.error(error);
        throw error;
      }

      // get payments ids who have been updated
      const paymentsIds = data.map((payment: Payment) => payment.id);

      const paymentsIdsMessage =
        paymentsIds.length > 0
          ? ` Payments ids: ${paymentsIds.join(', ')}`
          : '';

      this.logger.info(
        `Updated ${data.length} overdue payments with status ${status}.${paymentsIdsMessage}`,
      );
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}
