import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import {
  OPERATIONS_AND_UP,
  RECEPTION_AND_UP,
  Roles,
} from 'src/auth/roles.decorator';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import type { User } from 'src/users/entities/user.entity';
import { CreateOverflowTransactionDto } from './dto/create-overflow-transaction.dto';
import { CreatePaymentPlanDto } from './dto/create-payment-plan.dto';
import { CreatePaymentTransactionDto } from './dto/create-payment-transaction.dto';
import { EditarPlanDto } from './dto/editar-plan.dto';
import { UpdatePaymentScheduleDto } from './dto/update-payment-schedule.dto';
import { UpdatePaymentTransactionDto } from './dto/update-payment-transaction.dto';
import { Payment, PaymentTransaction } from './entities/payment.entity';
import { PaymentsService } from './payments.service';

// El plan de pagos, los abonos y los reembolsos entran con Gestiona y
// Cobra (paso 3.2, 14-09-2026). La lectura de cuotas de una cotización
// queda abierta más abajo: la pide el cotizador para avisar que hay un
// plan vivo, y en una empresa de Cotiza simplemente viene vacía.
@Derecho('post_venta')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly logger: PinoLogger,
  ) {}

  @Roles(...OPERATIONS_AND_UP)
  @Post('plan')
  createPaymentPlan(
    @Body() createPaymentPlanDto: CreatePaymentPlanDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /payments/plan with user ${user.id}`);
    return this.paymentsService.createPaymentPlan(
      createPaymentPlanDto,
      user.company_id,
    );
  }

  // «Editar plan de pagos» de Post-Venta (doc 14 §Editar el plan,
  // 28-10-2026): llegan las cuotas sin plata; las que tienen pagos quedan.
  @Roles(...OPERATIONS_AND_UP)
  @Put('plan')
  editarPlan(@Body() dto: EditarPlanDto, @CurrentUser() user: User) {
    this.logger.info(`PUT /payments/plan with user ${user.id}`);
    return this.paymentsService.editarPlan(dto, user.company_id);
  }

  // Las aceptadas, realizadas y anuladas sin ninguna cuota: Post-Venta las
  // muestra con el aviso «Sin plan de pagos» (28-10-2026, caso 703).
  @Roles(...OPERATIONS_AND_UP)
  @Get('eventos-sin-plan')
  findEventosSinPlan(@CurrentUser() user: User) {
    this.logger.info(`GET /payments/eventos-sin-plan with user ${user.id}`);
    return this.paymentsService.findEventosSinPlan(user.company_id);
  }

  @Roles(...RECEPTION_AND_UP)
  @Derecho(null)
  @Get()
  findAllPaymensFromQuotation(
    @Query('quotationId') quotationId: Quotation['id'],
    @CurrentUser() user: User,
  ) {
    return this.paymentsService.findAllPaymentsFromQuotation(
      [quotationId],
      user.company_id,
    );
  }

  @Roles(...OPERATIONS_AND_UP)
  @Get('transactions')
  findAllPaymentsWithTransactions(@CurrentUser() user: User) {
    this.logger.info(`GET /payments/transactions with user ${user.id}`);
    return this.paymentsService.findAllPaymentsWithTransactions(
      user.company_id,
    );
  }

  @Roles(...OPERATIONS_AND_UP)
  @Post('transactions')
  createPaymentTransaction(
    @Body() createPaymentTransactionDto: CreatePaymentTransactionDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /payments/transactions with user ${user.id}`);
    return this.paymentsService.createPaymentTransaction(
      createPaymentTransactionDto,
      user.company_id,
    );
  }

  @Roles(...OPERATIONS_AND_UP)
  @Post('transactions/overflow')
  createOverflowPaymentTransaction(
    @Body() createOverflowTransactionDto: CreateOverflowTransactionDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `POST /payments/transactions/overflow with user ${user.id}`,
    );
    return this.paymentsService.createOverflowPaymentTransaction(
      createOverflowTransactionDto,
      user.company_id,
    );
  }

  @Roles(...OPERATIONS_AND_UP)
  @Patch('transactions/:id')
  updatePaymentTransaction(
    @Param('id') paymentTransactionId: PaymentTransaction['id'],
    @Body() updatePaymentTransactionDto: UpdatePaymentTransactionDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /payments/transactions/${paymentTransactionId} with updatePaymentTransactionDto ${JSON.stringify(updatePaymentTransactionDto)}`,
    );
    return this.paymentsService.updatePaymentTransaction(
      paymentTransactionId,
      updatePaymentTransactionDto,
      user.company_id,
    );
  }
  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.paymentsService.findOne(+id);
  // }

  // Calendario de pagos, Nivel A: solo fecha y nota, solo cuotas sin
  // dinero registrado (el servicio lo verifica).
  @Roles(...OPERATIONS_AND_UP)
  @Patch(':id')
  updatePaymentSchedule(
    @Param('id') id: Payment['id'],
    @Body() dto: UpdatePaymentScheduleDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PATCH /payments/${id} with user ${user.id}`);
    return this.paymentsService.updatePaymentSchedule(id, dto, user.company_id);
  }

  @Roles(...OPERATIONS_AND_UP)
  @Delete(':id')
  removePayment(@Param('id') id: Payment['id'], @CurrentUser() user: User) {
    this.logger.info(`DELETE /payments/${id}`);
    return this.paymentsService.removePayment(id, user.company_id);
  }

  @Roles(...OPERATIONS_AND_UP)
  @Delete('transactions/:id')
  removePaymentTransaction(@Param('id') id: number, @CurrentUser() user: User) {
    this.logger.info(`DELETE /payments/transactions/${id}`);
    return this.paymentsService.removePaymentTransaction(+id, user.company_id);
  }
}
