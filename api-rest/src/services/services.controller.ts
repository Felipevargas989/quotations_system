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
import type { User } from 'src/users/entities/user.entity';
import { CreateFixedServiceDto } from './dto/create-fixed-service.dto';
import { CreateServicesBulkDto } from './dto/create-services-bulk.dto';
import { CreateVariableServiceDto } from './dto/create-variable-service.dto';
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

  @Patch('variable/:id')
  updateVariableService(
    @Param('id') id: VariableService['id'],
    @Body() updateVariableServiceDto: UpdateVariableServiceDto,
  ) {
    this.logger.info(
      `updateVariableService with id ${id} and updateVariableServiceDto ${JSON.stringify(updateVariableServiceDto)}`,
    );
    return this.servicesService.updateVariableService(
      id,
      updateVariableServiceDto,
    );
  }

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
