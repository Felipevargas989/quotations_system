import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { PaymentStatus } from 'src/payments/constants';
import { CreatePaymentDto } from 'src/payments/dto/create-payment.dto';
import { PaymentTransaction } from 'src/payments/entities/payment.entity';
import { PaymentsService } from 'src/payments/payments.service';
import { RefundsService } from 'src/refunds/refunds.service';
import { getEventDateUtc } from '../utils/dates';
import {
  PaymentPlanType,
  QuotationStatus,
  RequestType,
} from './constants/constants';
import { CheckConflictsWithExistingQuotationsDto } from './dto/check-conflicts-with-existing-quotations.dto';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QuotationItem } from './entities/quotation.entity';
import { CreateQuotation } from './interfaces/quotations.interface';
import { QuotationsRepository } from './quotations.repository';

@Injectable()
export class QuotationsService {
  constructor(
    private readonly quotationsRepository: QuotationsRepository,
    private readonly refundsService: RefundsService,
    // private readonly paymentsRepository: PaymentsRepository,
    private readonly paymentsService: PaymentsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotationsService.name);
  }
  async create(
    createQuotationDto: CreateQuotationDto,
    companyId: number,
    userId: string,
  ) {
    this.logger.info(
      `create quotation with createQuotationDto ${JSON.stringify(createQuotationDto)}`,
    );
    // set quotation number as the last quotation number + 1
    // get all quotations from the same company
    const quotations = await this.quotationsRepository.findAll({
      company_id: companyId,
      sort_by: 'quotation_number',
      sort_order: 'asc',
    });
    let quotationNumber = 1;
    if (quotations.length > 0) {
      quotationNumber = quotations[quotations.length - 1].quotation_number + 1;
    }
    const defaultItems: QuotationItem = {
      fixed_services: [],
      variable_services: [],
    };

    // This is to keep the event_date as ISO (UTC) string in the database
    // ISO 8601 with UTC offset (+00:00 = UTC), equivalent to 2025-09-24T00:00:00.000Z
    const eventDateUtc = getEventDateUtc(createQuotationDto.event_date);

    const newQuotation: CreateQuotation = {
      client_id: createQuotationDto.client_id,
      event_type: createQuotationDto.event_type,
      people_count: createQuotationDto.people_count,
      observations: createQuotationDto.observations,
      event_date: eventDateUtc,
      company_id: companyId,
      total_amount: createQuotationDto.total_amount || 0,
      quotation_status: createQuotationDto.quotation_status,
      quotation_number: quotationNumber,
      user_id: userId,
      value_per_person: createQuotationDto.value_per_person || 0,
      fixed_value: createQuotationDto.fixed_value || 0,
      request_type: createQuotationDto.request_type,
      requires_invoice: createQuotationDto.requires_invoice || false,
      has_contract: createQuotationDto.has_contract || false,
      payment_plan_type: PaymentPlanType.DEFAULT,
      discount_percentage: createQuotationDto.discount_percentage || 0,
      subtotal_amount: createQuotationDto.subtotal_amount || 0,
      items: createQuotationDto.items || defaultItems,
    };
    return this.quotationsRepository.create(newQuotation);
  }

  async findAll(
    companyId: number,
    request_type?: RequestType,
    statuses?: QuotationStatus[],
    dateRange?: { start_date: Date; end_date: Date },
  ) {
    this.logger.info(
      `findAll quotations with params ${companyId}, ${request_type}, ${JSON.stringify(statuses)}, ${JSON.stringify(dateRange)}`,
    );
    return this.quotationsRepository.findAll({
      company_id: companyId,
      request_type: request_type,
      statuses: statuses,
      dateRange: dateRange,
    });
  }

  findOne(id: string) {
    return this.quotationsRepository.findOne(id);
  }

  async update(
    id: string,
    updateQuotationDto: UpdateQuotationDto,
    companyId: number,
  ) {
    try {
      // 0. Get quotation
      const { data: quotation, error } =
        await this.quotationsRepository.findOne(id);

      if (error) {
        throw error;
      }

      if (!quotation) {
        throw new Error('Quotation not found');
      }

      // 1. Check quotation status
      // If quotation_states is accepted, handle update payment plan (payments)
      if (quotation.quotation_status === QuotationStatus.ACEPTADA) {
        // Get all payments PENDIENTE or VENCIDO
        const { data: payments, error: paymentsError } =
          await this.paymentsService.findAllPaymentsFromQuotation(
            [id],
            companyId,
            [PaymentStatus.PENDIENTE, PaymentStatus.VENCIDO],
          );
        if (paymentsError) {
          throw paymentsError;
        }

        // 2.1 If new total_amount is less than previous one, check if discount if possible or create a refund
        if (
          updateQuotationDto.total_amount &&
          updateQuotationDto.total_amount < quotation.total_amount
        ) {
          // get amount to reduce from the quotation
          let amountToReduce =
            quotation.total_amount - updateQuotationDto.total_amount;

          // if not payments, then create a refund with the difference
          if (!payments || payments.length === 0) {
            await this.refundsService.create({
              amount: amountToReduce,
              quotation_id: id,
            });
          }
          // if there is at least one pending payment
          else {
            // iterate over each payment and reduce the amountToReduce from each payment until the amountToReduce is 0
            for (const payment of payments) {
              // if amountToReduce is 0, then stop the iteration because all the decrements are applied
              if (amountToReduce === 0) {
                break;
              }
              // get already paid amount of this payment
              const alreadyPaidAmount = payment.payment_transactions.reduce(
                (sum: number, transaction: PaymentTransaction) =>
                  sum + transaction.amount,
                0,
              );

              // get pending amount to be paid of this payment
              const pendingAmountToBePaid = payment.amount - alreadyPaidAmount;

              // if pendingAmountToBePaid is greater than amountToReduce, then reduce the amountToReduce from payment
              if (pendingAmountToBePaid > amountToReduce) {
                // update payment with thew new amount
                await this.paymentsService.update(payment.id, {
                  amount: payment.amount - amountToReduce,
                });

                // update amountToReduce to 0
                amountToReduce = 0;
              }
              // if pendingAmountToBePaid is smaller than amountToReduce, then reduce the amount of the payment, update the payment and then continue with the next payment
              else {
                // update payment with the new amount (discount the min between pendingAmountToBePaid and amountToReduce)
                await this.paymentsService.update(payment.id, {
                  amount: payment.amount - pendingAmountToBePaid,
                });
                // update amountToReduce with the difference
                amountToReduce = amountToReduce - pendingAmountToBePaid;
              }
            }

            // check if amountToReduce is 0. If amountToReduce is not 0, then create a refund with the differencei
            if (amountToReduce > 0) {
              await this.refundsService.create({
                amount: amountToReduce,
                quotation_id: id,
              });
            }
          }
        }

        // 2.2 If new total_amount is greater thant previous one, update payments
        if (
          updateQuotationDto.total_amount &&
          updateQuotationDto.total_amount > quotation.total_amount
        ) {
          // If payments, then get the last one and increase the amount by the difference between the new total_amount and the previous total_amount
          if (payments && payments.length > 0) {
            // Get the last payment and increase the amount by the difference between the new total_amount and the previous total_amount
            const lastPayment = payments[payments.length - 1];
            const newAmount =
              lastPayment.amount +
              (updateQuotationDto.total_amount - quotation.total_amount);
            await this.paymentsService.update(lastPayment.id, {
              amount: newAmount,
            });
          }

          // If not payments, then create new payment with the difference between the new total_amount and the previous total_amount
          else if (!payments || payments.length === 0) {
            const newPayment: CreatePaymentDto = {
              quotation_id: id,
              amount: updateQuotationDto.total_amount - quotation.total_amount,
              notes: 'Pago creado por diferencia de total_amount',
            };
            await this.paymentsService.createPayment(newPayment, companyId);
          }
        }
      }

      // update quotation
      return this.quotationsRepository.update(
        id,
        updateQuotationDto,
        companyId,
      );
      // 3. If quotation_status is not accepted, update quotation
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  remove(id: string, companyId: number) {
    return this.quotationsRepository.remove(id, companyId);
  }

  async checkConflictsWithExistingQuotations(
    params: CheckConflictsWithExistingQuotationsDto,
    companyId: Company['id'],
  ): Promise<{ has_conflicts: boolean }> {
    this.logger.info(
      `checkConflictsWithExistingQuotations with params ${JSON.stringify(params)}`,
    );
    try {
      // 1. Get all quotations with the same event_date
      const data = await this.quotationsRepository.findAll({
        company_id: companyId,
        event_date: getEventDateUtc(params.event_date),
        statuses: [
          QuotationStatus.SOLICITADA,
          QuotationStatus.ENVIADA,
          QuotationStatus.EN_NEGOCIACION,
          QuotationStatus.ACEPTADA,
        ],
      });

      // 2. If there are any quotations, return there is conflicts
      if (data.length > 0) {
        return {
          has_conflicts: true,
        };
      }

      // 3. If there are no quotations, return there is no conflicts
      return {
        has_conflicts: false,
      };

      // 2. If there are any quotations, return there is conflicts
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }
}
