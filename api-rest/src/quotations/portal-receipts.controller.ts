import {
  BadRequestException,
  Body,
  Controller,
  forwardRef,
  Get,
  Inject,
  Injectable,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import { PaymentsService } from 'src/payments/payments.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { User } from 'src/users/entities/user.entity';

/**
 * Comprobantes del portal (Fase 2b): lo que el cliente sube queda
 * PENDIENTE aquí hasta que el equipo lo confirma — recién entonces se
 * registra el pago real (con todo el re-cuadre de siempre). La plata
 * nunca se registra sola.
 */

export interface PortalReceiptRow {
  id: number;
  company_id: number;
  quotation_id: string;
  payment_id: string | null;
  client_contact_id: number | null;
  file_url: string;
  declared_amount: number;
  status: string;
  review_note: string | null;
  created_at: string;
}

class ConfirmReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  payment_method?: string;
}

class RejectReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

@Injectable()
export class PortalReceiptsRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PortalReceiptsRepository.name);
  }

  async insert(
    row: Omit<PortalReceiptRow, 'id' | 'status' | 'created_at' | 'review_note'>,
  ) {
    this.logger.info(`portal receipt for quotation ${row.quotation_id}`);
    const { data, error } = await this.supabase.client
      .from('portal_receipts')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data as PortalReceiptRow;
  }

  async listPending(companyId: number) {
    this.logger.info(`pending portal receipts of company ${companyId}`);
    return (await this.supabase.client
      .from('portal_receipts')
      .select(
        `*,
        quotations ( quotation_number, event_type, clients ( name ) ),
        payments ( payment_number, amount ),
        client_contacts ( name )`,
      )
      .eq('company_id', companyId)
      .eq('status', 'pendiente')
      .order('created_at', { ascending: true })) as unknown as {
      data:
        | (PortalReceiptRow & {
            quotations: {
              quotation_number: number;
              event_type: string | null;
              clients: { name: string } | null;
            } | null;
            payments: { payment_number: number; amount: number } | null;
            client_contacts: { name: string } | null;
          })[]
        | null;
      error: PostgrestError | null;
    };
  }

  /** payment_ids con comprobante pendiente, para marcar "en revisión". */
  async pendingPaymentIds(quotationIds: string[]): Promise<Set<string>> {
    if (!quotationIds.length) return new Set();
    const { data } = await this.supabase.client
      .from('portal_receipts')
      .select('payment_id')
      .in('quotation_id', quotationIds)
      .eq('status', 'pendiente');
    const rows = (data || []) as { payment_id: string | null }[];
    return new Set(rows.map((r) => r.payment_id).filter(Boolean) as string[]);
  }

  async findOne(id: number, companyId: number) {
    return (await this.supabase.client
      .from('portal_receipts')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()) as unknown as {
      data: PortalReceiptRow | null;
      error: PostgrestError | null;
    };
  }

  async review(id: number, status: 'confirmado' | 'rechazado', note?: string) {
    const { error } = await this.supabase.client
      .from('portal_receipts')
      .update({
        status,
        review_note: note || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
  }
}

@Controller('portal-receipts')
export class PortalReceiptsController {
  constructor(
    private readonly repo: PortalReceiptsRepository,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PortalReceiptsController.name);
  }

  @Get()
  async list(@CurrentUser() user: User) {
    const { data, error } = await this.repo.listPending(user.company_id);
    if (error) throw error;
    return data || [];
  }

  @Roles(...OPERATIONS_AND_UP)
  @Post(':id/confirmar')
  async confirm(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmReceiptDto,
    @CurrentUser() user: User,
  ) {
    const { data: receipt } = await this.repo.findOne(id, user.company_id);
    if (!receipt || receipt.status !== 'pendiente' || !receipt.payment_id) {
      throw new BadRequestException(
        'Este comprobante ya fue revisado o no es válido',
      );
    }
    // El pago REAL se registra por la puerta de siempre (con su
    // re-cuadre del plan y el comprobante adjunto).
    await this.paymentsService.createPaymentTransaction(
      {
        payment_id: receipt.payment_id,
        quotation_id: receipt.quotation_id,
        amount: Number(receipt.declared_amount),
        payment_method: dto.payment_method || 'Transferencia bancaria',
        transaction_date: new Date().toISOString().slice(0, 10),
        notes: 'Comprobante recibido por el portal del cliente',
        receipt_photo_url: receipt.file_url,
      },
      user.company_id,
    );
    await this.repo.review(id, 'confirmado');
    return { ok: true };
  }

  @Roles(...OPERATIONS_AND_UP)
  @Post(':id/rechazar')
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectReceiptDto,
    @CurrentUser() user: User,
  ) {
    const { data: receipt } = await this.repo.findOne(id, user.company_id);
    if (!receipt || receipt.status !== 'pendiente') {
      throw new BadRequestException('Este comprobante ya fue revisado');
    }
    await this.repo.review(id, 'rechazado', dto.note);
    return { ok: true };
  }
}
