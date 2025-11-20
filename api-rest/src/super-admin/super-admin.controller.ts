import { Body, Controller, Get, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Public } from 'src/auth';
import { CreateSuscriptionDto } from './dto/create-suscription.dto';
import { NotifySuperAdminDto } from './dto/notify-super-admin.dto';
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

  @Public()
  @Get('stats/last-month')
  getStatsLastMonth() {
    this.logger.info(`GET /super-admin/stats/last-month`);
    return this.superAdminService.getStatsLastMonth();
  }

  @Public()
  @Post('new-lead')
  notifySuperAdmins(@Body() notifySuperAdminDto: NotifySuperAdminDto) {
    this.logger.info(
      `POST /super-admin/new-lead with body ${JSON.stringify(notifySuperAdminDto)}`,
    );
    return this.superAdminService.notifySuperAdmins(notifySuperAdminDto);
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
