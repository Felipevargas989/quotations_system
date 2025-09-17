import { Body, Controller, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { CreateServicesBulkDto } from './dto/create-services-bulk.dto';
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

  // @Get()
  // findAll() {
  //   return this.servicesService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.servicesService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateServiceDto: UpdateServiceDto) {
  //   return this.servicesService.update(+id, updateServiceDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.servicesService.remove(+id);
  // }
}
