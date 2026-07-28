import { Module } from '@nestjs/common';
import {
  SectionsController,
  SectionsRepository,
} from './sections.controller';
import { ServicesController } from './services.controller';
import { ServicesRepository } from './services.repository';
import { ServicesService } from './services.service';

@Module({
  controllers: [ServicesController, SectionsController],
  providers: [ServicesService, ServicesRepository, SectionsRepository],
})
export class ServicesModule {}
