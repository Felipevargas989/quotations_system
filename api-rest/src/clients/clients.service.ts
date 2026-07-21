import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ClientsRepository } from './clients.repository';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
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

  async findOne(
    company_id: number,
    id?: number,
    email?: string,
    phone?: string,
  ) {
    this.logger.info(
      `findOne client with company_id ${company_id} and id ${id} and email ${email} and phone ${phone}`,
    );
    try {
      return await this.clientsRepository.findOne(company_id, id, email, phone);
    } catch (error) {
      this.logger.error(
        `error finding client with id ${id} and email ${email} and phone ${phone}`,
        error,
      );
      throw error;
    }
  }

  update(id: string, updateClientDto: UpdateClientDto, companyId: number) {
    this.logger.info(
      `update client with id ${id} and updateClientDto ${JSON.stringify(updateClientDto)}`,
    );
    return this.clientsRepository.update(id, updateClientDto, companyId);
  }

  remove(id: string, companyId: number) {
    this.logger.info(`remove client with id ${id}`);
    return this.clientsRepository.remove(id, companyId);
  }

  findSummary(id: string, companyId: number) {
    this.logger.info(`findSummary client ${id}`);
    return this.clientsRepository.findSummary(id, companyId);
  }

  // ---- Tipos de cliente ----
  findTypes(companyId: number) {
    return this.clientsRepository.findTypes(companyId);
  }

  createType(companyId: number, name: string) {
    return this.clientsRepository.createType(companyId, name);
  }

  removeType(id: number, companyId: number) {
    return this.clientsRepository.removeType(id, companyId);
  }
}
