import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { User } from 'src/users/entities/user.entity';
import { CreateQuotationFollowupDto } from './dto/create-quotation-followup.dto';
import { UpdateQuotationFollowupDto } from './dto/update-quotation-followup.dto';
import { QuotationFollowupsRepository } from './quotation-followups.repository';
import { CreateFollowupPayload, UpdateFollowupPayload } from './types';

// Bitácora comercial (03-08): reglas de negocio del hilo de seguimiento.
// Dos candados fijos: la empresa sale de la sesión (nunca del body) y
// una nota solo la edita/elimina quien la escribió.
@Injectable()
export class QuotationFollowupsService {
  constructor(
    private readonly followupsRepository: QuotationFollowupsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotationFollowupsService.name);
  }

  // Semáforo de la lista: por cada cotización, cuándo fue la última
  // nota y el próximo contacto DE ESA nota (no el más próximo de todas:
  // la última palabra escrita es la que manda).
  async mapByCompany(companyId: Company['id']) {
    this.logger.info(`mapByCompany followups company ${companyId}`);
    try {
      const rows = await this.followupsRepository.findMapRows(companyId);
      // Las filas llegan de la más nueva a la más vieja: la primera
      // aparición de cada cotización ES su última nota.
      //
      // El COMPROMISO va aparte (07-08): no siempre vive en la última
      // nota. En Post-Venta se anota sin fecha la mayoría de las veces,
      // así que el pendiente puede estar tres notas más atrás. Se busca
      // la más reciente que tenga fecha y NO esté dada por cumplida.
      const map: Record<
        string,
        {
          last_at: string;
          next_contact_date: string | null;
          next_contact_done_at: string | null;
        }
      > = {};
      for (const row of rows) {
        if (!map[row.quotation_id]) {
          map[row.quotation_id] = {
            last_at: row.created_at,
            next_contact_date: null,
            next_contact_done_at: null,
          };
        }
        const actual = map[row.quotation_id];
        if (
          !actual.next_contact_date &&
          row.next_contact_date &&
          !row.next_contact_done_at
        ) {
          actual.next_contact_date = row.next_contact_date;
        }
      }
      return map;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async findByQuotation(companyId: Company['id'], quotationId: string) {
    this.logger.info(`findByQuotation followups ${quotationId}`);
    try {
      return await this.followupsRepository.findByQuotation(
        companyId,
        quotationId,
      );
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async create(user: User, dto: CreateQuotationFollowupDto) {
    this.logger.info(
      `create followup for quotation ${dto.quotation_id} company ${user.company_id}`,
    );
    try {
      // El @IsNotEmpty del DTO deja pasar "   ": el trim decide acá.
      const note = dto.note.trim();
      if (!note) {
        throw new BadRequestException('La nota no puede estar vacía');
      }
      // Candado de empresa ANTES de insertar: la cotización debe ser
      // de la empresa de la sesión.
      const quotation = await this.followupsRepository.findOwnedQuotation(
        user.company_id,
        dto.quotation_id,
      );
      if (!quotation) {
        throw new ForbiddenException('La cotización no pertenece a tu empresa');
      }
      const payload: CreateFollowupPayload = {
        quotation_id: dto.quotation_id,
        company_id: user.company_id,
        // `user.id`, NO `user.user_id`: el guardián de sesión adjunta
        // { id, company_id, role, email } y nunca un user_id. El tipo
        // User lo declara, así que TypeScript no avisaba y se venía
        // guardando `undefined` → null en todas las notas (medido el
        // 07-08: 38 de 38). Con el autor en null, assertAuthor comparaba
        // null contra el id de la sesión y devolvía 403 a TODOS: nadie
        // podía editar ni borrar ni su propia nota.
        author_user_id: user.id,
        // Nombre CONGELADO al escribir: si el usuario cambia de nombre
        // (o se va), la bitácora conserva quién firmó cada nota.
        author_name: user.full_name || user.email,
        note,
        tipo: dto.tipo ?? null,
        next_contact_date: dto.next_contact_date ?? null,
      };
      return await this.followupsRepository.create(payload);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async update(user: User, id: number, dto: UpdateQuotationFollowupDto) {
    this.logger.info(`update followup ${id} company ${user.company_id}`);
    try {
      // Marcar "Listo" NO es editar la nota: es cerrar una tarea. La
      // regla "solo el autor modifica su nota" protege las PALABRAS de
      // otro —la historia no se reescribe— pero no puede impedir que
      // quien hizo la llamada la dé por hecha (07-08: las notas eran de
      // Camila y Felipe recibía 403 al apretar Listo). Cuando lo único
      // que viaja es el cumplido, basta con que la nota sea de la
      // empresa; para cualquier otro cambio sigue mandando la autoría.
      const soloCumplido =
        dto.next_contact_done_at !== undefined &&
        dto.note === undefined &&
        dto.tipo === undefined &&
        dto.next_contact_date === undefined;
      if (soloCumplido) {
        const nota = await this.followupsRepository.findById(
          user.company_id,
          id,
        );
        if (!nota) {
          throw new NotFoundException('Nota de seguimiento no encontrada');
        }
      } else {
        await this.assertAuthor(user, id);
      }
      const fields: UpdateFollowupPayload = {
        // La hora de edición la pone el servidor, no el cliente.
        updated_at: new Date().toISOString(),
      };
      if (dto.note !== undefined) {
        const note = dto.note.trim();
        if (!note) {
          throw new BadRequestException('La nota no puede estar vacía');
        }
        fields.note = note;
      }
      if (dto.tipo !== undefined) fields.tipo = dto.tipo;
      if (dto.next_contact_date !== undefined) {
        fields.next_contact_date = dto.next_contact_date;
      }
      // "Listo": da el pendiente por cumplido sin borrar la fecha. Con
      // null vuelve a quedar pendiente (migración 65).
      if (dto.next_contact_done_at !== undefined) {
        fields.next_contact_done_at = dto.next_contact_done_at;
      }
      return await this.followupsRepository.update(user.company_id, id, fields);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async remove(user: User, id: number) {
    this.logger.info(`remove followup ${id} company ${user.company_id}`);
    try {
      await this.assertAuthor(user, id);
      return await this.followupsRepository.remove(user.company_id, id);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  // Doble candado de escritura: la nota debe ser de la EMPRESA de la
  // sesión (el findById ya filtra company_id) y del AUTOR de la sesión.
  private async assertAuthor(user: User, id: number) {
    const followup = await this.followupsRepository.findById(
      user.company_id,
      id,
    );
    if (!followup) {
      throw new NotFoundException('Nota de seguimiento no encontrada');
    }
    // Las notas escritas ANTES del arreglo tienen el autor en null. No
    // se pueden dejar bloqueadas para siempre: en esas se cae al nombre
    // congelado, que es la identidad que sí se guardó (el correo de
    // quien escribió).
    const esAutor =
      followup.author_user_id != null
        ? followup.author_user_id === user.id
        : !!user.email &&
          (followup.author_name || '').toLowerCase() ===
            user.email.toLowerCase();
    if (!esAutor) {
      throw new ForbiddenException('Solo el autor puede modificar su nota');
    }
    return followup;
  }
}
