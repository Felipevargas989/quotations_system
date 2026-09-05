import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { EventTypesRepository } from './event-types.repository';

/**
 * TIPOS DE EVENTO ADMINISTRABLES (05-09, doc 12): dejan de ser lista
 * fija en el código. Cada tipo declara su ENTRADA — 'cotizacion' (el
 * formulario público crea cotización, como siempre) o 'consulta' (el
 * embudo). OJO: tipo de CLIENTE y tipo de EVENTO son ejes separados;
 * este catálogo es del QUÉ celebran, no del quién.
 *
 * Reglas de Felipe: agregar y eliminar sí (eliminar solo sin uso,
 * "como siempre"); renombrar NO existe en v1 — el histórico guarda el
 * texto y un rename lo dejaría huérfano.
 */
@Injectable()
export class EventTypesService {
  constructor(
    private readonly repo: EventTypesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EventTypesService.name);
  }

  listar(companyId: number) {
    return this.repo.listar(companyId);
  }

  listarPublico(companyId: number) {
    return this.repo.listarPublico(companyId);
  }

  entradaDe(companyId: number, name: string) {
    return this.repo.entradaDe(companyId, name);
  }

  async crear(companyId: number, name: string) {
    const limpio = name.trim();
    if (!limpio) throw new BadRequestException('El tipo necesita un nombre');
    const r = await this.repo.crear(companyId, limpio);
    if (r === 'duplicado') {
      throw new BadRequestException('Ese tipo de evento ya existe');
    }
    this.logger.info(`tipo de evento creado: ${limpio}`);
    return r;
  }

  /** Cambia la entrada (cotización/consulta) o el estado activo. Un
   *  tipo EN USO no se elimina — se inactiva (regla de siempre). */
  async actualizar(
    id: number,
    companyId: number,
    cambios: { entrada?: 'cotizacion' | 'consulta'; activo?: boolean },
  ) {
    if (cambios.entrada === undefined && cambios.activo === undefined) {
      throw new BadRequestException('Nada que cambiar');
    }
    const r = await this.repo.actualizar(id, companyId, cambios);
    if (!r) throw new NotFoundException('No existe ese tipo de evento');
    return r;
  }

  /** Eliminar solo sin uso ("como siempre"). */
  async eliminar(id: number, companyId: number) {
    const tipo = await this.repo.porId(id, companyId);
    if (!tipo) throw new NotFoundException('No existe ese tipo de evento');
    const enUso = await this.repo.usosDe(companyId, tipo.name);
    if (enUso > 0) {
      throw new BadRequestException(
        `"${tipo.name}" está en uso (${String(enUso)} entre cotizaciones y consultas): no se puede eliminar`,
      );
    }
    await this.repo.eliminar(id, companyId);
    this.logger.info(`tipo de evento eliminado: ${tipo.name}`);
    return { id };
  }
}
