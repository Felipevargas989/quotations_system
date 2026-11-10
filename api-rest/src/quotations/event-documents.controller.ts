import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Optional,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { DentroDe, Permiso } from 'src/auth/permiso.decorator';
import { Roles, SALES_AND_UP } from 'src/auth/roles.decorator';
import { DelEvento } from 'src/clients/del-evento.decorator';
import { OrdenesDeCompraService } from 'src/facturacion/ordenes-de-compra/ordenes-de-compra.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import { UserRole, type User } from 'src/users/entities/user.entity';

// Mudanza #7 (28-07): documentos del evento por el backend. La tabla no
// tiene company_id: la pertenencia se verifica vía la cotización.
export class AddDocumentDto {
  @IsUUID()
  quotation_id: string;

  // 'comercial' (04-08): respaldos de la negociación — pantallazos de
  // WhatsApp/correos que suben desde la ficha del negocio.
  @IsIn(['contratos', 'ordenes_compra', 'facturas', 'comercial', 'otros'])
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

  async delete(companyId: number, id: number, soloComercial = false) {
    this.logger.info(`delete document ${id}`);
    const { data, error: findErr } = await this.supabase.client
      .from('event_documents')
      .select('id, category, quotations!inner(company_id)')
      .eq('id', id)
      .eq('quotations.company_id', companyId)
      .single();
    if (findErr || !data) throw findErr || new Error('Documento no encontrado');
    if (soloComercial && data.category !== 'comercial') {
      throw new ForbiddenException(SOLO_COMERCIAL);
    }
    const { error } = await this.supabase.client
      .from('event_documents')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { deleted: true };
  }
}

// Vendedor incluido desde el 03-11-2026 (Felipe: "los vendedores sí deben
// subir captures"): la ficha del negocio les muestra los respaldos
// comerciales y el motor se los rechazaba. Solo la categoría
// 'comercial': contratos, órdenes de compra y facturas son de Post-Venta,
// que sigue siendo de operaciones para arriba.
const SOLO_COMERCIAL =
  'Tu cargo solo puede subir o quitar respaldos comerciales.';
const esVendedor = (user: User) => user.role === UserRole.VENDEDOR;

// Con un tipo de cliente apagado (doc 22 §9, tanda 2), los documentos de
// sus eventos no se ven ni se tocan.
@Roles(...SALES_AND_UP)
@Permiso('postventa')
@DentroDe('cotizaciones')
@Controller('event-documents')
export class EventDocumentsController {
  constructor(
    private readonly repo: EventDocumentsRepository,
    // La lectura de la OC al subirla (doc 19 §9.26): solo con el módulo
    // propio `facturacion`.
    @Optional() private readonly ocs?: OrdenesDeCompraService,
  ) {}

  @DelEvento({ query: 'quotationId' })
  @Get()
  findByQuotation(
    @Query('quotationId') quotationId: string,
    @CurrentUser() user: User,
  ) {
    return this.repo.findByQuotation(user.company_id, quotationId);
  }

  @DelEvento({ body: 'quotation_id' })
  @Post()
  add(@Body() dto: AddDocumentDto, @CurrentUser() user: User) {
    if (esVendedor(user) && dto.category !== 'comercial') {
      throw new ForbiddenException(SOLO_COMERCIAL);
    }
    const agregado = this.repo.add(user.company_id, dto);
    // Doc 19 §9.26 (Felipe, 07-11): la OC que se sube la lee BelIA por
    // detrás, para que la factura quede lista. Solo con Facturación.
    if (
      dto.category === 'ordenes_compra' &&
      this.ocs &&
      user.derechos?.includes('facturacion')
    ) {
      const ocs = this.ocs;
      void agregado
        .then(() =>
          ocs.leerAlSubir(dto.quotation_id, user.company_id, user.id ?? null),
        )
        .catch(() => undefined);
    }
    return agregado;
  }

  @DelEvento({ tabla: 'event_documents', param: 'id' })
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.repo.delete(user.company_id, id, esVendedor(user));
  }
}
