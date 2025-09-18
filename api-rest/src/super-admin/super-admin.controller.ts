import { Body, Controller, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Public } from 'src/auth';
import { CreateSuscriptionDto } from './dto/create-suscription.dto';
import { SuperAdminService } from './super-admin.service';

@Controller('super-admin')
export class SuperAdminController {
  constructor(
    private readonly superAdminService: SuperAdminService,
    private readonly logger: PinoLogger,
  ) {}

  @Public()
  @Post('suscription')
  createSuscription(@Body() createSuscriptionDto: CreateSuscriptionDto) {
    this.logger.info(
      `POST /super-admin/suscription with createSuscriptionDto ${JSON.stringify(createSuscriptionDto)}`,
    );
    return this.superAdminService.createSuscription(createSuscriptionDto);
  }
  // @Post()
  // create(@Body() createSuperAdminDto: CreateSuperAdminDto) {
  //   return this.superAdminService.create(createSuperAdminDto);
  // }

  // @Get()
  // findAll() {
  //   return this.superAdminService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.superAdminService.findOne(+id);
  // }

  // @Patch(':id')
  // update(
  //   @Param('id') id: string,
  //   @Body() updateSuperAdminDto: UpdateSuperAdminDto,
  // ) {
  //   return this.superAdminService.update(+id, updateSuperAdminDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.superAdminService.remove(+id);
  // }
}
