import { ConflictException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { UsersRepository } from 'src/users/users.repository';
import { logSafe } from '../logging/log-safe';
import { ClientContactsRepository } from './client-contacts.controller';
import { ClientsRepository } from './clients.repository';
import { CoincidenciaCliente, buscarCoincidencias } from './coincidencias';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreateClient } from './interfaces/clients.interfaces';

/** Código del 409 que las pantallas reconocen para mostrar el aviso. */
export const CLIENTE_PARECIDO = 'CLIENTE_PARECIDO';

@Injectable()
export class ClientsService {
  constructor(
    private readonly clientsRepository: ClientsRepository,
    private readonly clientContactsRepository: ClientContactsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClientsService.name);
  }

  /**
   * Los clientes de la empresa que se parecen al que se va a crear
   * (correo, teléfono, nombre o dominio de institución). Ver
   * `coincidencias.ts`: solo sirven para PREGUNTAR, nunca enganchan solos.
   */
  async coincidencias(
    dto: CreateClientDto,
    companyId: number,
  ): Promise<CoincidenciaCliente[]> {
    const [clientes, equipo] = await Promise.all([
      this.clientsRepository.paraCoincidir(companyId),
      this.usersRepository.findAll(companyId),
    ]);
    const dominiosDelEquipo = (equipo || [])
      .map((u) => (u.email || '').split('@')[1]?.toLowerCase() || '')
      .filter(Boolean);
    return buscarCoincidencias(
      {
        nombre: dto.name,
        correos: [dto.email, dto.contact_email],
        telefonos: [dto.phone, dto.contact_phone],
      },
      clientes,
      dominiosDelEquipo,
    );
  }

  /**
   * EL PORTERO DE LAS PANTALLAS (16-10-2026, Felipe: "sí, ármalo así").
   * Recepción, el cotizador y Clientes crean por acá. Si el cliente se
   * parece a uno que ya existe, NO se crea: vuelve un 409 con las
   * coincidencias y la pantalla pregunta (usar ese cliente, sumar la
   * persona como contacto, o "es otro cliente, crear igual", que vuelve
   * con `confirmado`). El formulario público y las consultas NO pasan
   * por acá: siguen con `findMatch`, solo por correo (regla del 05-09).
   */
  async crearDesdePantalla(dto: CreateClientDto, companyId: number) {
    const { confirmado, ...datos } = dto;
    if (!confirmado) {
      const coincidencias = await this.coincidencias(datos, companyId);
      if (coincidencias.length > 0) {
        this.logger.info(
          `crearDesdePantalla: ${coincidencias.length} cliente(s) parecido(s) (${coincidencias
            .map((c) => c.motivos.join('+'))
            .join(', ')}); se pregunta antes de crear`,
        );
        throw new ConflictException({
          statusCode: 409,
          codigo: CLIENTE_PARECIDO,
          message: 'Ya hay un cliente parecido en Eventia.',
          coincidencias,
        });
      }
    }
    return this.create(datos, companyId);
  }

  async create(createClientDto: CreateClientDto, companyId: number) {
    this.logger.info(
      `create client with createClientDto ${logSafe(createClientDto)}`,
    );

    // create new client object (los campos de la persona no van a la
    // tabla clients; `confirmado` es solo la respuesta al aviso de
    // cliente parecido, tampoco es columna)
    const { contact_email, contact_phone, ...conMarca } = createClientDto;
    const clientFields = { ...conMarca };
    delete clientFields.confirmado;
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
