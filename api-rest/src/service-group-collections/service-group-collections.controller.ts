import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { CreateServiceGroupCollectionDto } from './dto/create-service-group-collection.dto';
import { ServiceGroupCollection } from './entities/service-group-collection.entity';
import { ServiceGroupCollectionsService } from './service-group-collections.service';

@Controller('service-group-collections')
export class ServiceGroupCollectionsController {
  constructor(
    private readonly service: ServiceGroupCollectionsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ServiceGroupCollectionsController.name);
  }

  @Post()
  create(
    @Body() createDto: CreateServiceGroupCollectionDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `create service group collection with dto ${JSON.stringify(createDto)}`,
    );
    return this.service.create(createDto, user.company_id);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    this.logger.info(`findAll service group collections with user ${user.id}`);
    return this.service.findAll(user.company_id);
  }

  @Delete(':id')
  remove(@Param('id') id: ServiceGroupCollection['id']) {
    this.logger.info(`remove service group collection with id ${id}`);
    return this.service.remove(+id);
  }
}
