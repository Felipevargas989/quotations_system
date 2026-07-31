import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { logSafe } from '../logging/log-safe';
import { ClientContactsRepository } from './client-contacts.controller';
import { ClientsRepository } from './clients.repository';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreateClient } from './interfaces/clients.interfaces';

@Injectable()
export class ClientsService {
  constructor(
    private readonly clientsRepository: ClientsRepository,
    private readonly clientContactsRepository: ClientContactsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClientsService.name);
  }
  async create(createClientDto: CreateClientDto, companyId: number) {
    this.logger.info(
      `create client with createClientDto ${logSafe(createClientDto)}`,
    );

    // create new client object (los campos de la persona no van a la
    // tabla clients)
    const { contact_email, contact_phone, ...clientFields } = createClientDto;
    const newClient: CreateClient = {
      ...clientFields,
      company_id: companyId,
    };

    // create new client
    const created = await this.clientsRepository.create(newClient);

    // GARANTÍA DE NACIMIENTO (31-07, regla de Felipe): todo cliente
    // nace con su persona principal — por CUALQUIER camino (ficha,
    // cotizador, formulario público). La persona es la fuente de
    // verdad; el espejo de la ficha queda jubilado.
    const createdId = (created as { id?: string } | null)?.id;
    if (createdId) {
      const personaNombre =
        (createClientDto.contact_person || '').trim() ||
        createClientDto.name.trim();
      try {
        await this.clientContactsRepository.create(companyId, {
          client_id: createdId,
          name: personaNombre,
          email: contact_email?.trim() || createClientDto.email || null,
          phone: contact_phone?.trim() || createClientDto.phone || null,
          is_primary: true,
        } as never);
      } catch (error) {
        // La persona es best-effort: no se aborta la creación del
        // cliente por ella (se puede completar a mano).
        this.logger.error(error);
      }
    }

    return created;
  }

  findAll(companyId: number) {
    this.logger.info(`findAll clients with companyId ${companyId}`);
    return this.clientsRepository.findAll(companyId);
  }

  findMatch(company_id: number, email?: string, phone?: string) {
    return this.clientsRepository.findMatch(company_id, email, phone);
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
      `update client with id ${id} and updateClientDto ${logSafe(updateClientDto)}`,
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

  reorderTypes(companyId: number, ids: number[]) {
    return this.clientsRepository.reorderTypes(companyId, ids);
  }

  removeType(id: number, companyId: number) {
    return this.clientsRepository.removeType(id, companyId);
  }
}
