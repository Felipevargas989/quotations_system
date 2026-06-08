import { Module } from '@nestjs/common';
import { ServiceGroupCollectionsController } from './service-group-collections.controller';
import { ServiceGroupCollectionsRepository } from './service-group-collections.repository';
import { ServiceGroupCollectionsService } from './service-group-collections.service';

@Module({
  controllers: [ServiceGroupCollectionsController],
  providers: [
    ServiceGroupCollectionsService,
    ServiceGroupCollectionsRepository,
  ],
})
export class ServiceGroupCollectionsModule {}
