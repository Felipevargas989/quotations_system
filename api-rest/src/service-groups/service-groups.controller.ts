import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { CreateServiceGroupDto } from './dto/create-service-group.dto';
import { ServiceGroup } from './entities/service-group.entity';
import { ServiceGroupsService } from './service-groups.service';
import { Roles, SALES_AND_UP } from 'src/auth/roles.decorator';

@Controller('service-groups')
export class ServiceGroupsController {
  constructor(
    private readonly serviceGroupsService: ServiceGroupsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ServiceGroupsController.name);
  }

  @Roles(...SALES_AND_UP)
  @Post()
  create(
    @Body() createServiceGroupDto: CreateServiceGroupDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `create service group with dto ${JSON.stringify(createServiceGroupDto)}`,
    );
    return this.serviceGroupsService.create(
      createServiceGroupDto,
      user.company_id,
    );
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    this.logger.info(`findAll service groups with user ${user.id}`);
    return this.serviceGroupsService.findAll(user.company_id);
  }

  @Roles(...SALES_AND_UP)
  @Delete(':id')
  remove(@Param('id') id: ServiceGroup['id']) {
    this.logger.info(`remove service group with id ${id}`);
    return this.serviceGroupsService.remove(+id);
  }
}
