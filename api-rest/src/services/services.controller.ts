import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateFixedServiceDto } from './dto/create-fixed-service.dto';
import { CreateServicesBulkDto } from './dto/create-services-bulk.dto';
import { CreateVariableServiceDto } from './dto/create-variable-service.dto';
import {
  CreateFixedSectionDto,
  ReorderFixedSectionsDto,
  ReorderFixedServicesDto,
  UpdateFixedSectionDto,
} from './dto/fixed-sections.dto';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';
import { ReorderServicesInCategoryDto } from './dto/reorder-services-in-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateFixedServiceDto } from './dto/update-fixed-service.dto';
import { UpdateServiceCategoryDto } from './dto/update-service-category.dto';
import { UpdateVariableServiceDto } from './dto/update-variable-service.dto';
import { FixedService, VariableService } from './entities/service.entity';
import { ServicesService } from './services.service';

@Controller('services')
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ServicesController.name);
  }

  @Roles(...ADMIN_ONLY)
  @Post('bulk')
  createServicesBulk(
    @Body() createServicesBulkDto: CreateServicesBulkDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `createServicesBulk with createServicesBulkDto ${JSON.stringify(createServicesBulkDto)}`,
    );
    return this.servicesService.createServicesBulk(
      createServicesBulkDto,
      user.company_id,
    );
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    this.logger.info(`findAll services with user ${user.id}`);
    return this.servicesService.findAll(user.company_id);
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.servicesService.findOne(+id);
  // }

  // ---- Secciones de servicios FIJOS (migración 53) ----

  @Get('fixed-sections')
  listFixedSections(@CurrentUser() user: User) {
    return this.servicesService.listFixedSections(user.company_id);
  }

  @Roles(...ADMIN_ONLY)
  @Post('fixed-sections/new')
  createFixedSection(
    @Body() dto: CreateFixedSectionDto,
    @CurrentUser() user: User,
  ) {
    return this.servicesService.createFixedSectionForCompany(
      user.company_id,
      dto.name,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Patch('fixed-sections/reorder')
  reorderFixedSections(
    @Body() dto: ReorderFixedSectionsDto,
    @CurrentUser() user: User,
  ) {
    return this.servicesService.reorderFixedSections(
      user.company_id,
      dto.section_ids,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Patch('fixed-sections/:id')
  updateFixedSection(
    @Param('id') id: string,
    @Body() dto: UpdateFixedSectionDto,
    @CurrentUser() user: User,
  ) {
    return this.servicesService.updateFixedSectionById(
      user.company_id,
      +id,
      dto,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Delete('fixed-sections/:id')
  deleteFixedSection(@Param('id') id: string, @CurrentUser() user: User) {
    return this.servicesService.deleteFixedSectionById(user.company_id, +id);
  }

  @Roles(...ADMIN_ONLY)
  @Patch('fixed/reorder')
  reorderFixedServices(
    @Body() dto: ReorderFixedServicesDto,
    @CurrentUser() user: User,
  ) {
    return this.servicesService.reorderFixedServices(
      user.company_id,
      dto.section_id ?? null,
      dto.service_ids,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Patch('categories')
  updateServiceCategory(
    @Body() updateServiceCategoryDto: UpdateServiceCategoryDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `updateServiceCategory with updateServiceCategoryDto ${JSON.stringify(updateServiceCategoryDto)}`,
    );
    return this.servicesService.updateServiceCategory(
      user.company_id,
      updateServiceCategoryDto,
    );
  }

  // ---- Multi-category endpoints (declared before variable/:id) ----

  @Roles(...ADMIN_ONLY)
  @Patch('reorder-services')
  reorderServicesInCategory(
    @Body() dto: ReorderServicesInCategoryDto,
    @CurrentUser() user: User,
  ) {
    return this.servicesService.reorderServicesInCategory(
      user.company_id,
      dto.category_id,
      dto.service_ids,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Patch('reorder-categories')
  reorderCategories(
    @Body() dto: ReorderCategoriesDto,
    @CurrentUser() user: User,
  ) {
    return this.servicesService.reorderCategories(
      user.company_id,
      dto.category_ids,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Post('categories/new')
  createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() user: User) {
    return this.servicesService.createCategoryForCompany(
      user.company_id,
      dto.name,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Patch('categories/:id')
  updateCategoryById(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: User,
  ) {
    return this.servicesService.renameOrUpdateCategory(
      user.company_id,
      +id,
      dto,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Delete('categories/:id')
  deleteCategoryById(@Param('id') id: string, @CurrentUser() user: User) {
    return this.servicesService.deleteCategoryForCompany(user.company_id, +id);
  }

  @Roles(...ADMIN_ONLY)
  @Patch('variable/:id/categories')
  setServiceCategories(
    @Param('id') id: VariableService['id'],
    @Body() body: { category_ids: number[] },
    @CurrentUser() user: User,
  ) {
    return this.servicesService.setServiceCategories(
      user.company_id,
      +id,
      body.category_ids,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Patch('variable/:id')
  updateVariableService(
    @Param('id') id: VariableService['id'],
    @Body() updateVariableServiceDto: UpdateVariableServiceDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `updateVariableService with id ${id} and updateVariableServiceDto ${JSON.stringify(updateVariableServiceDto)}`,
    );
    return this.servicesService.updateVariableService(
      id,
      updateVariableServiceDto,
      user.company_id,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Patch('fixed/:id')
  updateFixedService(
    @Param('id') id: FixedService['id'],
    @Body() updateFixedServiceDto: UpdateFixedServiceDto,
  ) {
    this.logger.info(
      `updateFixedService with id ${id} and updateFixedServiceDto ${JSON.stringify(updateFixedServiceDto)}`,
    );
    return this.servicesService.updateFixedService(id, updateFixedServiceDto);
  }

  @Roles(...ADMIN_ONLY)
  @Post('variable')
  createVariableService(
    @Body()
    createVariableServiceDto: CreateVariableServiceDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `createVariableService with createVariableServiceDto ${JSON.stringify(createVariableServiceDto)}`,
    );
    return this.servicesService.createVariableService(
      createVariableServiceDto,
      user.company_id,
    );
  }

  @Roles(...ADMIN_ONLY)
  @Post('fixed')
  createFixedService(
    @Body()
    createFixedServiceDto: CreateFixedServiceDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `createFixedService with createFixedServiceDto ${JSON.stringify(createFixedServiceDto)}`,
    );
    return this.servicesService.createFixedService(
      createFixedServiceDto,
      user.company_id,
    );
  }

  @Delete('variable/:id')
  removeVariableService(@Param('id') id: VariableService['id']) {
    this.logger.info(`removeVariableService with id ${id}`);
    return this.servicesService.removeVariableService(+id);
  }

  @Delete('fixed/:id')
  removeFixedService(@Param('id') id: FixedService['id']) {
    this.logger.info(`removeFixedService with id ${id}`);
    return this.servicesService.removeFixedService(+id);
  }
}
