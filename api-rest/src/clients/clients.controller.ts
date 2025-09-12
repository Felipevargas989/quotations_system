import { Body, Controller, Get, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import type { User } from 'src/users/entities/user.entity';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClientsController.name);
  }

  @Post()
  create(@Body() createClientDto: CreateClientDto, @CurrentUser() user: User) {
    this.logger.info(
      `POST /clients with createClientDto ${JSON.stringify(createClientDto)}`,
    );
    return this.clientsService.create(createClientDto, user.company_id);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    this.logger.info(`GET /clients with user ${user.id}`);
    return this.clientsService.findAll(user.company_id);
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.clientsService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateClientDto: UpdateClientDto) {
  //   return this.clientsService.update(+id, updateClientDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.clientsService.remove(+id);
  // }
}
