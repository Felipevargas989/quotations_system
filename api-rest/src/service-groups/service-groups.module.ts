import { Module } from '@nestjs/common';
import { ServiceGroupsController } from './service-groups.controller';
import { ServiceGroupsRepository } from './service-groups.repository';
import { ServiceGroupsService } from './service-groups.service';

@Module({
  controllers: [ServiceGroupsController],
  providers: [ServiceGroupsService, ServiceGroupsRepository],
})
export class ServiceGroupsModule {}
