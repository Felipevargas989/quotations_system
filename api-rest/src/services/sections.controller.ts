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
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { ADMIN_ONLY, RECEPTION_AND_UP, Roles } from 'src/auth/roles.decorator';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { User } from 'src/users/entities/user.entity';
import {
  CreateSectionDto,
  RenameSectionDto,
  ReorderSectionsDto,
  SetDefaultSectionDto,
  SetLinkSectionDto,
} from './dto/category-section.dto';

// Mudanza #7 (28-07): secciones de la carta por el backend. Lecturas
// para vendedor+ (el cotizador y las fichas las usan); edición solo
// administrador (vive en el Catálogo). Empresa SIEMPRE de la sesión.
@Injectable()
export class SectionsRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SectionsRepository.name);
  }

  async findAll(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('category_sections')
      .select('*')
      .eq('company_id', companyId)
      .order('sort_order');
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async menuOrder(companyId: number) {
    const [cats, secs, links] = await Promise.all([
      this.supabase.client
        .from('service_categories')
        .select('id, name')
        .eq('company_id', companyId),
      this.supabase.client
        .from('category_sections')
        .select('*')
        .eq('company_id', companyId)
        .order('sort_order'),
      this.supabase.client
        .from('variable_service_categories')
        .select('id, category_id, variable_service_id, section_id, sort_order')
        .eq('company_id', companyId),
    ]);
    if (cats.error) throw cats.error;
    if (secs.error) throw secs.error;
    if (links.error) throw links.error;
    return {
      categories: cats.data || [],
      sections: secs.data || [],
      links: links.data || [],
    };
  }

  async create(companyId: number, dto: CreateSectionDto) {
    const { data, error } = await this.supabase.client
      .from('category_sections')
      .insert({ ...dto, company_id: companyId })
      .select()
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  async rename(companyId: number, id: number, name: string) {
    const { error } = await this.supabase.client
      .from('category_sections')
      .update({ name })
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { renamed: true };
  }

  async delete(companyId: number, id: number) {
    const { error } = await this.supabase.client
      .from('category_sections')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { deleted: true };
  }

  async reorder(companyId: number, orderedIds: number[]) {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await this.supabase.client
        .from('category_sections')
        .update({ sort_order: i })
        .eq('id', orderedIds[i])
        .eq('company_id', companyId);
      if (error) throw error;
    }
    return { reordered: orderedIds.length };
  }

  async setDefault(
    companyId: number,
    categoryId: number,
    sectionId: number | null,
  ) {
    const { error: clearErr } = await this.supabase.client
      .from('category_sections')
      .update({ is_default: false })
      .eq('company_id', companyId)
      .eq('category_id', categoryId)
      .eq('is_default', true);
    if (clearErr) throw clearErr;
    if (sectionId === null || sectionId === undefined) return { saved: true };
    const { error } = await this.supabase.client
      .from('category_sections')
      .update({ is_default: true })
      .eq('id', sectionId)
      .eq('company_id', companyId);
    if (error) throw error;
    return { saved: true };
  }

  async setLinkSection(
    companyId: number,
    linkId: number,
    sectionId: number | null,
    sortOrder: number,
  ) {
    const { error } = await this.supabase.client
      .from('variable_service_categories')
      .update({ section_id: sectionId, sort_order: sortOrder })
      .eq('id', linkId)
      .eq('company_id', companyId);
    if (error) throw error;
    return { saved: true };
  }
}

@Controller('sections')
export class SectionsController {
  constructor(
    private readonly repo: SectionsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SectionsController.name);
  }

  // Las DOS lecturas se abren a recepción (12-08). Es el ORDEN de la
  // carta —categorías, secciones y a qué sección va cada servicio—, sin
  // un solo precio. El visor de la cotización lo pide para agrupar el
  // "Incluye:" por secciones; con el 403 el error se tragaba en silencio
  // y tanto la pantalla como el PDF salían con todo en una línea
  // corrida. Escribir secciones sigue siendo de administrador.
  @Roles(...RECEPTION_AND_UP)
  @Get()
  findAll(@CurrentUser() user: User) {
    return this.repo.findAll(user.company_id);
  }

  @Roles(...RECEPTION_AND_UP)
  @Get('menu-order')
  menuOrder(@CurrentUser() user: User) {
    return this.repo.menuOrder(user.company_id);
  }

  @Roles(...ADMIN_ONLY)
  @Post()
  create(@Body() dto: CreateSectionDto, @CurrentUser() user: User) {
    return this.repo.create(user.company_id, dto);
  }

  @Roles(...ADMIN_ONLY)
  @Patch('reorder')
  reorder(@Body() dto: ReorderSectionsDto, @CurrentUser() user: User) {
    return this.repo.reorder(user.company_id, dto.orderedIds);
  }

  @Roles(...ADMIN_ONLY)
  @Patch('default')
  setDefault(@Body() dto: SetDefaultSectionDto, @CurrentUser() user: User) {
    return this.repo.setDefault(
      user.company_id,
      dto.category_id,
      dto.section_id ?? null,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Patch('link/:linkId')
  setLinkSection(
    @Param('linkId', ParseIntPipe) linkId: number,
    @Body() dto: SetLinkSectionDto,
    @CurrentUser() user: User,
  ) {
    return this.repo.setLinkSection(
      user.company_id,
      linkId,
      dto.section_id ?? null,
      dto.sort_order,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Patch(':id')
  rename(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenameSectionDto,
    @CurrentUser() user: User,
  ) {
    return this.repo.rename(user.company_id, id, dto.name);
  }

  @Roles(...ADMIN_ONLY)
  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.repo.delete(user.company_id, id);
  }
}
