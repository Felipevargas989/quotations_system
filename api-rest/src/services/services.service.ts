import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { CreateFixedServiceDto } from './dto/create-fixed-service.dto';
import { CreateServicesBulkDto } from './dto/create-services-bulk.dto';
import { CreateVariableServiceDto } from './dto/create-variable-service.dto';
import { UpdateFixedServiceDto } from './dto/update-fixed-service.dto';
import { UpdateServiceCategoryDto } from './dto/update-service-category.dto';
import { UpdateVariableServiceDto } from './dto/update-variable-service.dto';
import { FixedService, VariableService } from './entities/service.entity';
import { ServicesRepository } from './services.repository';
import { validateFixedServices } from './utils';
@Injectable()
export class ServicesService {
  constructor(
    private readonly servicesRepository: ServicesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ServicesService.name);
  }
  async createServicesBulk(
    createServicesBulkDto: CreateServicesBulkDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `createServicesBulk with createServicesBulkDto ${JSON.stringify(createServicesBulkDto)}`,
    );
    try {
      // create variable services
      const variableServices: Omit<VariableService, 'id'>[] =
        createServicesBulkDto.variable_services.map((service) => ({
          ...service,
          company_id: companyId,
        }));
      // create fixed services
      const fixedServices: Omit<FixedService, 'id'>[] =
        createServicesBulkDto.fixed_services.map((service) => ({
          ...service,
          company_id: companyId,
        }));

      // validate fixed services before creating them
      validateFixedServices(fixedServices);

      // create variable services in DB
      await this.servicesRepository.createVariableServices(variableServices);
      // create fixed services in DB
      await this.servicesRepository.createFixedServices(fixedServices);

      return {
        variableServices,
        fixedServices,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  async findAll(companyId: Company['id']) {
    this.logger.info(`findAll services with companyId ${companyId}`);

    try {
      // find all variable services
      const variableServices =
        await this.servicesRepository.findAllVariableServices(companyId);
      // find all fixed services
      const fixedServices =
        await this.servicesRepository.findAllFixedServices(companyId);
      // find category activation settings
      const categories =
        await this.servicesRepository.findAllServiceCategories(companyId);
      // find service <-> category links (multi-category)
      const categoryLinks =
        await this.servicesRepository.findAllServiceCategoryLinks(companyId);

      return {
        variableServices: variableServices.data,
        fixedServices: fixedServices.data,
        categories: categories.data,
        categoryLinks: categoryLinks.data,
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  async updateVariableService(
    id: VariableService['id'],
    updateVariableServiceDto: UpdateVariableServiceDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `updateVariableService with id ${id} and updateVariableServiceDto ${JSON.stringify(updateVariableServiceDto)}`,
    );
    try {
      const { category_ids, ...rest } =
        updateVariableServiceDto as UpdateVariableServiceDto & {
          category_ids?: number[];
        };

      // Update the service row itself (category_ids is not a column).
      const result = await this.servicesRepository.updateVariableService(
        id,
        rest,
      );

      // If categories were provided, sync the links (enforces >= 1).
      if (category_ids !== undefined) {
        if (!category_ids || category_ids.length === 0) {
          throw new HttpException(
            'El servicio debe pertenecer al menos a una categoría',
            HttpStatus.BAD_REQUEST,
          );
        }
        await this.linkServiceToCategories(companyId, id, category_ids);
      }
      return result;
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) throw error;
      throw new Error(error);
    }
  }

  async updateFixedService(
    id: FixedService['id'],
    updateFixedServiceDto: UpdateFixedServiceDto,
  ) {
    this.logger.info(
      `updateFixedService with id ${id} and updateFixedServiceDto ${JSON.stringify(updateFixedServiceDto)}`,
    );
    try {
      // validate fixed service before updating it
      validateFixedServices([updateFixedServiceDto as CreateFixedServiceDto]);

      return await this.servicesRepository.updateFixedService(
        id,
        updateFixedServiceDto,
      );
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  async createVariableService(
    createVariableServiceDto: CreateVariableServiceDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `createVariableService with createVariableServiceDto ${JSON.stringify(createVariableServiceDto)}`,
    );
    try {
      const { category_ids, category, ...rest } = createVariableServiceDto;

      // Resolve the categories this service belongs to (multi-category).
      const categoryIds = await this.resolveCategoryIds(
        companyId,
        category_ids,
        category,
      );
      if (categoryIds.length === 0) {
        throw new HttpException(
          'El servicio debe pertenecer al menos a una categoría',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Keep the legacy single-category text column populated for compatibility.
      const categories =
        await this.servicesRepository.findAllServiceCategories(companyId);
      const legacyName =
        categories.data?.find((c) => c.id === categoryIds[0])?.name ??
        category ??
        '';

      const created = await this.servicesRepository.createVariableService({
        ...rest,
        category: legacyName,
        company_id: companyId,
      } as CreateVariableServiceDto);

      const serviceId = created.data?.id;
      if (serviceId) {
        await this.linkServiceToCategories(companyId, serviceId, categoryIds);
      }
      return created;
    } catch (error) {
      this.logger.error(error);
      if (error instanceof HttpException) throw error;
      throw new Error(error);
    }
  }

  // Resolve incoming category_ids; if only a legacy category name is given,
  // find-or-create that category and return its id.
  private async resolveCategoryIds(
    companyId: Company['id'],
    categoryIds?: number[],
    categoryName?: string,
  ): Promise<number[]> {
    if (categoryIds && categoryIds.length) return categoryIds;
    if (categoryName && categoryName.trim()) {
      const cat = await this.findOrCreateCategory(companyId, categoryName);
      return cat ? [cat.id] : [];
    }
    return [];
  }

  // Find a category by name (case-insensitive) or create it. Prevents
  // reintroducing duplicated categories through typos.
  private async findOrCreateCategory(companyId: Company['id'], name: string) {
    const trimmed = name.trim();
    const { data: existing } = await this.servicesRepository.findCategoryByName(
      companyId,
      trimmed,
    );
    if (existing && existing.length) return existing[0];
    const nextOrder =
      (await this.servicesRepository.getMaxCategorySortOrder(companyId)) + 1;
    const { data } = await this.servicesRepository.createCategory(
      companyId,
      trimmed,
      nextOrder,
    );
    return data as Record<string, unknown>;
  }

  // Replace a service's category links with the given set (append new at the
  // end of each category, remove links no longer selected).
  private async linkServiceToCategories(
    companyId: Company['id'],
    serviceId: VariableService['id'],
    categoryIds: number[],
  ) {
    const { data: currentLinks } =
      await this.servicesRepository.getLinksForService(serviceId);
    const current = new Set((currentLinks ?? []).map((l) => l.category_id));
    const target = new Set(categoryIds);

    // remove links no longer wanted
    for (const catId of current) {
      if (!target.has(catId)) {
        await this.servicesRepository.deleteServiceCategoryLink(
          serviceId,
          catId,
        );
      }
    }
    // add new links at the end of each category
    for (const catId of categoryIds) {
      if (!current.has(catId)) {
        const nextOrder =
          (await this.servicesRepository.getMaxServiceSortOrder(
            companyId,
            catId,
          )) + 1;
        await this.servicesRepository.insertServiceCategoryLink(
          companyId,
          serviceId,
          catId,
          nextOrder,
        );
      }
    }
  }

  // Update the set of categories a service belongs to (enforces >= 1).
  async setServiceCategories(
    companyId: Company['id'],
    serviceId: VariableService['id'],
    categoryIds: number[],
  ) {
    if (!categoryIds || categoryIds.length === 0) {
      throw new HttpException(
        'El servicio debe pertenecer al menos a una categoría',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.linkServiceToCategories(companyId, serviceId, categoryIds);
    return { success: true };
  }

  // Reorder services within a single category.
  // Migración 55: el reorden completo viaja en UNA llamada (antes era
  // una orden por servicio — arrastrar en categorías gordas se
  // demoraba segundos).
  async reorderServicesInCategory(
    companyId: Company['id'],
    categoryId: number,
    serviceIds: number[],
  ) {
    await this.servicesRepository.reorderServicesInCategoryBulk(
      companyId,
      categoryId,
      serviceIds,
    );
    return { success: true };
  }

  // ---- Category management ----

  async createCategoryForCompany(companyId: Company['id'], name: string) {
    const cat = await this.findOrCreateCategory(companyId, name);
    return cat;
  }

  async renameOrUpdateCategory(
    companyId: Company['id'],
    id: number,
    fields: { name?: string; is_active?: boolean; sort_order?: number },
  ) {
    const clean: Record<string, unknown> = {};
    if (fields.name !== undefined) clean.name = fields.name.trim();
    if (fields.is_active !== undefined) clean.is_active = fields.is_active;
    if (fields.sort_order !== undefined) clean.sort_order = fields.sort_order;
    const { data } = await this.servicesRepository.updateCategory(
      companyId,
      id,
      clean,
    );
    return data as Record<string, unknown>;
  }

  // Delete a category, but block if any service depends solely on it.
  async deleteCategoryForCompany(companyId: Company['id'], id: number) {
    const orphans = await this.servicesRepository.getServicesOnlyInCategory(
      companyId,
      id,
    );
    if (orphans.length > 0) {
      throw new HttpException(
        {
          message:
            'No se puede borrar la categoría: hay servicios que solo pertenecen a ella. Muévelos o elimínalos primero.',
          service_ids: orphans,
        },
        HttpStatus.CONFLICT,
      );
    }
    await this.servicesRepository.deleteCategory(companyId, id);
    return { success: true };
  }

  async reorderCategories(companyId: Company['id'], categoryIds: number[]) {
    for (let i = 0; i < categoryIds.length; i++) {
      await this.servicesRepository.updateCategory(companyId, categoryIds[i], {
        sort_order: i + 1,
      });
    }
    return { success: true };
  }

  // Códigos en uso en cotizaciones (migración 54).
  async usedServiceCodes(companyId: Company['id']) {
    return this.servicesRepository.usedServiceCodes(companyId);
  }

  // ---- Secciones de servicios fijos (migración 53): espejo de las
  // categorías de variables, pero un servicio vive en UNA sección. ----

  async listFixedSections(companyId: Company['id']) {
    return this.servicesRepository.listFixedSections(companyId);
  }

  async createFixedSectionForCompany(companyId: Company['id'], name: string) {
    const existentes =
      await this.servicesRepository.listFixedSections(companyId);
    return this.servicesRepository.createFixedSection(
      companyId,
      name.trim(),
      existentes.length + 1,
    );
  }

  async updateFixedSectionById(
    companyId: Company['id'],
    id: number,
    fields: { name?: string; is_active?: boolean },
  ) {
    const clean: Record<string, unknown> = {};
    if (fields.name !== undefined) clean.name = fields.name.trim();
    if (fields.is_active !== undefined) clean.is_active = fields.is_active;
    return this.servicesRepository.updateFixedSection(companyId, id, clean);
  }

  // Borrar una sección NO borra servicios: caen a "Sin sección" (el
  // vínculo es ON DELETE SET NULL en la base).
  async deleteFixedSectionById(companyId: Company['id'], id: number) {
    await this.servicesRepository.deleteFixedSection(companyId, id);
    return { success: true };
  }

  async reorderFixedSections(companyId: Company['id'], sectionIds: number[]) {
    for (let i = 0; i < sectionIds.length; i++) {
      await this.servicesRepository.updateFixedSection(
        companyId,
        sectionIds[i],
        { sort_order: i + 1 },
      );
    }
    return { success: true };
  }

  // El drop del arrastre: la lista COMPLETA de la sección destino, en
  // su orden final (el servicio movido incluido).
  // Migración 55: sección + orden en UNA llamada (antes, 37 viajes
  // para soltar algo en "Sin sección").
  async reorderFixedServices(
    companyId: Company['id'],
    sectionId: number | null,
    serviceIds: number[],
  ) {
    await this.servicesRepository.reorderFixedServicesBulk(
      companyId,
      sectionId,
      serviceIds,
    );
    return { success: true };
  }

  async createFixedService(
    createFixedServiceDto: CreateFixedServiceDto,
    companyId: Company['id'],
  ) {
    this.logger.info(
      `createFixedService with createFixedServiceDto ${JSON.stringify(createFixedServiceDto)}`,
    );
    try {
      const serviceData = {
        ...createFixedServiceDto,
        company_id: companyId,
      };
      // validate fixed service before creating it
      validateFixedServices([serviceData]);

      return await this.servicesRepository.createFixedService(serviceData);
    } catch (error) {
      this.logger.error(error);
      throw new HttpException(
        (error as Error).message || 'Error al crear el servicio fijo',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateServiceCategory(
    companyId: Company['id'],
    updateServiceCategoryDto: UpdateServiceCategoryDto,
  ) {
    this.logger.info(
      `updateServiceCategory with companyId ${companyId} and dto ${JSON.stringify(updateServiceCategoryDto)}`,
    );
    try {
      return await this.servicesRepository.upsertServiceCategory(
        companyId,
        updateServiceCategoryDto.name,
        updateServiceCategoryDto.is_active,
      );
    } catch (error) {
      this.logger.error(error);
      throw new Error(error);
    }
  }

  async removeVariableService(id: VariableService['id']) {
    this.logger.info(`removeVariableService with id ${id}`);
    return await this.servicesRepository.removeVariableService(id);
  }

  async removeFixedService(id: FixedService['id']) {
    this.logger.info(`removeFixedService with id ${id}`);
    return await this.servicesRepository.removeFixedService(id);
  }
}
