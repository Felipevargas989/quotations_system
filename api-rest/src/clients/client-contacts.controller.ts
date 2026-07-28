import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { User } from 'src/users/entities/user.entity';
import {
  CreateClientContactDto,
  UpdateClientContactDto,
} from './dto/client-contact.dto';

// Mudanza #7 (28-07): contactos de cliente por el backend. Los usan
// todas las pantallas de clientes y el cotizador (todos los cargos con
// sesión), así que basta la sesión — pero TODO va acotado por empresa
// (la versión directa editaba por id, sin verificar de quién era).
@Injectable()
export class ClientContactsRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClientContactsRepository.name);
  }

  async findByClient(companyId: number, clientId: string) {
    this.logger.info(`contacts of client ${clientId}`);
    const { data, error } = await this.supabase.client
      .from('client_contacts')
      .select('*')
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .order('is_primary', { ascending: false })
      .order('name');
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async create(companyId: number, dto: CreateClientContactDto) {
    this.logger.info(`create contact (datos redactados)`);
    const { data, error } = await this.supabase.client
      .from('client_contacts')
      .insert({ ...dto, company_id: companyId })
      .select()
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  async update(companyId: number, id: number, dto: UpdateClientContactDto) {
    this.logger.info(`update contact ${id}`);
    const { error } = await this.supabase.client
      .from('client_contacts')
      .update(dto)
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { updated: true };
  }

  async delete(companyId: number, id: number) {
    this.logger.info(`delete contact ${id}`);
    const { error } = await this.supabase.client
      .from('client_contacts')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { deleted: true };
  }

  // Uno principal por cliente: despeja el anterior y fija el nuevo.
  async setPrimary(companyId: number, clientId: string, contactId: number) {
    this.logger.info(`setPrimary contact ${contactId} of ${clientId}`);
    const { error: clearErr } = await this.supabase.client
      .from('client_contacts')
      .update({ is_primary: false })
      .eq('company_id', companyId)
      .eq('client_id', clientId)
      .eq('is_primary', true);
    if (clearErr) throw clearErr;
    const { error } = await this.supabase.client
      .from('client_contacts')
      .update({ is_primary: true })
      .eq('id', contactId)
      .eq('company_id', companyId);
    if (error) throw error;
    return { saved: true };
  }
}

@Controller('client-contacts')
export class ClientContactsController {
  constructor(
    private readonly repo: ClientContactsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClientContactsController.name);
  }

  @Get()
  findByClient(@Query('clientId') clientId: string, @CurrentUser() user: User) {
    return this.repo.findByClient(user.company_id, clientId);
  }

  @Post()
  create(@Body() dto: CreateClientContactDto, @CurrentUser() user: User) {
    return this.repo.create(user.company_id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClientContactDto,
    @CurrentUser() user: User,
  ) {
    return this.repo.update(user.company_id, id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.repo.delete(user.company_id, id);
  }

  @Post(':id/primary')
  setPrimary(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { client_id: string },
    @CurrentUser() user: User,
  ) {
    return this.repo.setPrimary(user.company_id, body.client_id, id);
  }
}
