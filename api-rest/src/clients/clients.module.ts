import { Module } from '@nestjs/common';
import { UsersRepository } from 'src/users/users.repository';
import { ClientsController } from './clients.controller';
import { ClientsRepository } from './clients.repository';
import { ClientsService } from './clients.service';

@Module({
  controllers: [ClientsController],
  providers: [ClientsService, ClientsRepository, UsersRepository],
})
export class ClientsModule {}
