import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { UsersRepository } from 'src/users/users.repository';
import { ClientsRepository } from './clients.repository';
import { CreateClientDto } from './dto/create-client.dto';
import { CreateClient } from './interfaces/clients.interfaces';

@Injectable()
export class ClientsService {
  constructor(
    private readonly clientsRepository: ClientsRepository,
    private readonly logger: PinoLogger,
    private readonly usersRepository: UsersRepository,
  ) {
    this.logger.setContext(ClientsService.name);
  }
  async create(createClientDto: CreateClientDto, userId: string) {
    this.logger.info(
      `create client with createClientDto ${JSON.stringify(createClientDto)}`,
    );

    // get user company id
    const user = await this.usersRepository.findOne(userId);

    // create new client object
    const newClient: CreateClient = {
      ...createClientDto,
      company_id: user.company_id,
    };

    // create new client
    return this.clientsRepository.create(newClient);
  }

  // findAll() {
  //   return `This action returns all clients`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} client`;
  // }

  // update(id: number, updateClientDto: UpdateClientDto) {
  //   return `This action updates a #${id} client`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} client`;
  // }
}
