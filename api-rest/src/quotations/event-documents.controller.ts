import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { User } from 'src/users/entities/user.entity';

// Mudanza #7 (28-07): documentos del evento por el backend. La tabla no
// tiene company_id: la pertenencia se verifica vía la cotización.
export class AddDocumentDto {
  @IsUUID()
  quotation_id: string;

  @IsIn(['contratos', 'ordenes_compra', 'facturas', 'otros'])
  category: string;

  @IsString()
  @IsNotEmpty()
  file_name: string;

  @IsString()
  @IsNotEmpty()
  file_url: string;
}

@Injectable()
export class EventDocumentsRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EventDocumentsRepository.name);
  }

  private async assertQuotationOfCompany(
    companyId: number,
    quotationId: string,
  ) {
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select('id')
      .eq('id', quotationId)
      .eq('company_id', companyId)
      .single();
    if (error || !data) throw error || new Error('Cotización no encontrada');
  }

  async findByQuotation(companyId: number, quotationId: string) {
    this.logger.info(`documents of ${quotationId}`);
    await this.assertQuotationOfCompany(companyId, quotationId);
    const { data, error } = await this.supabase.client
      .from('event_documents')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('uploaded_at', { ascending: false });
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async add(companyId: number, dto: AddDocumentDto) {
    this.logger.info(`add document to ${dto.quotation_id}`);
    await this.assertQuotationOfCompany(companyId, dto.quotation_id);
    const { error } = await this.supabase.client
      .from('event_documents')
      .insert(dto);
    if (error) throw error;
    return { added: true };
  }

  async delete(companyId: number, id: number) {
    this.logger.info(`delete document ${id}`);
    const { data, error: findErr } = await this.supabase.client
      .from('event_documents')
      .select('id, quotations!inner(company_id)')
      .eq('id', id)
      .eq('quotations.company_id', companyId)
      .single();
    if (findErr || !data) throw findErr || new Error('Documento no encontrado');
    const { error } = await this.supabase.client
      .from('event_documents')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { deleted: true };
  }
}

@Roles(...OPERATIONS_AND_UP)
@Controller('event-documents')
export class EventDocumentsController {
  constructor(private readonly repo: EventDocumentsRepository) {}

  @Get()
  findByQuotation(
    @Query('quotationId') quotationId: string,
    @CurrentUser() user: User,
  ) {
    return this.repo.findByQuotation(user.company_id, quotationId);
  }

  @Post()
  add(@Body() dto: AddDocumentDto, @CurrentUser() user: User) {
    return this.repo.add(user.company_id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.repo.delete(user.company_id, id);
  }
}
