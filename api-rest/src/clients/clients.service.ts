import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ClientsRepository } from './clients.repository';
import { CreateClientDto } from './dto/create-client.dto';
import { CreateClient } from './interfaces/clients.interfaces';

@Injectable()
export class ClientsService {
  constructor(
    private readonly clientsRepository: ClientsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClientsService.name);
  }
  async create(createClientDto: CreateClientDto, companyId: number) {
    this.logger.info(
      `create client with createClientDto ${JSON.stringify(createClientDto)}`,
    );

    // create new client object
    const newClient: CreateClient = {
      ...createClientDto,
      company_id: companyId,
    };

    // create new client
    return this.clientsRepository.create(newClient);
  }

  findAll(companyId: number) {
    this.logger.info(`findAll clients with companyId ${companyId}`);
    return this.clientsRepository.findAll(companyId);
  }

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
