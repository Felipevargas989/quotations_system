import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  CrearAudienciaDto,
  ImportarContactosDto,
  PreviaSegmentoDto,
} from './dto/marketing.dto';
import { MarketingRepository } from './marketing.repository';
import { FiltroSegmento, resolverSegmento } from './segmento';

/**
 * LA ESTANTERÍA DE AUDIENCIAS: guardadas (preguntas vivas) e
 * importadas (listas fijas) — crear, listar, renombrar, borrar,
 * importar contactos y la previa del constructor de segmentos.
 *
 * Nació el 28-08 cuando la cerca de tamaño pilló a marketing.service
 * cruzando las 800 líneas: esta es la pieza extraída (higuera, no
 * reescritura). El envío de campañas la usa para resolver segmentos.
 */
@Injectable()
export class AudienciasService {
  constructor(
    private readonly repo: MarketingRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AudienciasService.name);
  }

  // ---- Audiencias ----
  /** Eliminar una importada: borra la lista, no las bajas (esas son
   *  para siempre). Las campañas ya enviadas guardan su historia. */
  async borrarImportada(companyId: number, nombre: string) {
    const limpio = nombre?.trim();
    if (!limpio) throw new BadRequestException('Falta el nombre');
    const eliminados = await this.repo.borrarImportada(companyId, limpio);
    if (eliminados === 0) {
      throw new NotFoundException('No existe esa audiencia importada');
    }
    this.logger.info(`importada eliminada: ${limpio} (${eliminados})`);
    return { ok: true, eliminados };
  }

  /** El lápiz: renombrar. Hacia un nombre ocupado se RECHAZA — nada
   *  de fusiones silenciosas (índice único por audiencia). */
  async renombrarImportada(companyId: number, nombre: string, nuevo: string) {
    const limpio = nuevo?.trim();
    if (!limpio) throw new BadRequestException('Falta el nombre nuevo');
    if (limpio === nombre.trim()) return { ok: true };
    const ocupado = await this.repo.contarImportada(companyId, limpio);
    if (ocupado > 0) {
      throw new BadRequestException('Ya existe una audiencia con ese nombre');
    }
    const movidos = await this.repo.renombrarImportada(
      companyId,
      nombre.trim(),
      limpio,
    );
    if (movidos === 0) {
      throw new NotFoundException('No existe esa audiencia importada');
    }
    return { ok: true, movidos };
  }

  async renombrarAudiencia(id: number, companyId: number, nombre: string) {
    const limpio = nombre?.trim();
    if (!limpio) throw new BadRequestException('Falta el nombre nuevo');
    await this.repo.renombrarAudiencia(id, companyId, limpio);
    return { ok: true };
  }

  async borrarContactoImportado(
    companyId: number,
    nombre: string,
    email: string,
  ) {
    const borrados = await this.repo.borrarContactoImportado(
      companyId,
      nombre?.trim() ?? '',
      email?.trim() ?? '',
    );
    if (borrados === 0) {
      throw new NotFoundException('Ese contacto no está en la audiencia');
    }
    return { ok: true };
  }

  async importarContactos(dto: ImportarContactosDto, companyId: number) {
    const validos: Record<string, unknown>[] = [];
    const invalidos: string[] = [];
    const vistos = new Set<string>();
    for (const c of dto.contactos) {
      const email = (c.email || '').trim().toLowerCase();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        if (email) invalidos.push(email);
        continue;
      }
      if (vistos.has(email)) continue;
      vistos.add(email);
      validos.push({
        company_id: companyId,
        audiencia: dto.audiencia.trim(),
        email,
        name: c.name?.trim() || null,
        empresa: c.empresa?.trim() || null,
      });
    }
    await this.repo.importarContactos(validos);
    this.logger.info(
      `importar ${dto.audiencia}: ${validos.length} validos, ${invalidos.length} invalidos`,
    );
    return {
      importados: validos.length,
      duplicados_en_archivo:
        dto.contactos.length - validos.length - invalidos.length,
      invalidos,
    };
  }

  /** Las importadas con el número HONESTO: a cuántos les llegaría hoy
   *  (bajas descontadas y visibles) — mismo criterio que las guardadas. */
  async audienciasImportadas(companyId: number) {
    const [filas, suprimidos] = await Promise.all([
      this.repo.contactosImportados(companyId),
      this.repo.suprimidos(companyId),
    ]);
    const por = new Map<string, { contactos: number; bajas: number }>();
    for (const f of filas) {
      const cur = por.get(f.audiencia) ?? { contactos: 0, bajas: 0 };
      if (suprimidos.has(f.email.toLowerCase())) cur.bajas += 1;
      else cur.contactos += 1;
      por.set(f.audiencia, cur);
    }
    return [...por.entries()].map(([audiencia, c]) => ({ audiencia, ...c }));
  }

  /** Quiénes están dentro de una audiencia importada (Felipe 26-08):
   *  la lista con los dados de baja MARCADOS, no escondidos. */
  async contactosDeImportada(companyId: number, audiencia: string) {
    const [filas, suprimidos] = await Promise.all([
      this.repo.contactosDeAudiencia(companyId, audiencia),
      this.repo.suprimidos(companyId),
    ]);
    return filas.map((f) => ({
      email: f.email,
      nombre: f.name,
      empresa: f.empresa,
      baja: suprimidos.has(f.email.toLowerCase()),
    }));
  }

  tiposDeCliente(companyId: number) {
    return this.repo.tiposDeCliente(companyId);
  }

  tiposDeEvento(companyId: number) {
    return this.repo.tiposDeEvento(companyId);
  }

  // ---- Fase 3: el segmento desde los datos de la casa ----
  // El filtro decide por CLIENTES; el resultado son sus PERSONAS
  // (client_contacts con correo; respaldo: el correo de la ficha).
  async resolverSegmentoDe(companyId: number, filtro: FiltroSegmento) {
    // Las cotizaciones solo se traen si el filtro las mira: el caso
    // más frecuente ("Todos", tipo de cliente) no las necesita.
    const miraCotizaciones = Boolean(
      filtro.con_estados?.length ||
        filtro.tipos_evento?.length ||
        filtro.evento_desde ||
        filtro.evento_hasta ||
        filtro.sin_cotizacion_desde ||
        filtro.aniversario ||
        filtro.monto_min != null,
    );
    const [clientes, cotizaciones, contactos] = await Promise.all([
      this.repo.clientesSegmentables(companyId),
      miraCotizaciones
        ? this.repo.cotizacionesSegmentables(companyId)
        : Promise.resolve([]),
      this.repo.contactosDeClientes(companyId),
    ]);
    return resolverSegmento(
      clientes,
      cotizaciones,
      contactos,
      filtro,
      new Date().toISOString().slice(0, 10),
    );
  }

  /** La previa en vivo del constructor: cuántas PERSONAS, y la lista
   *  completa en tres columnas — cliente, contacto y correo. */
  async previaSegmento(dto: PreviaSegmentoDto, companyId: number) {
    const [lista, suprimidos] = await Promise.all([
      this.resolverSegmentoDe(companyId, dto.filtro),
      this.repo.suprimidos(companyId),
    ]);
    const limpios = lista.filter((d) => !suprimidos.has(d.email.toLowerCase()));
    return {
      total: limpios.length,
      muestra: limpios.slice(0, 500).map((d) => ({
        email: d.email,
        cliente: d.empresa ?? d.name ?? '',
        contacto: d.name,
      })),
    };
  }

  // ---- Audiencias guardadas: la estantería ----
  async crearAudiencia(dto: CrearAudienciaDto, companyId: number) {
    const nombre = dto.nombre.trim();
    if (!nombre) throw new BadRequestException('Ponle nombre a la audiencia');
    try {
      return await this.repo.crearAudiencia({
        company_id: companyId,
        nombre,
        filtro: (dto.filtro ?? {}) as Record<string, unknown>,
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new BadRequestException('Ya existe una audiencia con ese nombre');
      }
      throw e;
    }
  }

  /**
   * La estantería completa, cada audiencia con su conteo EN VIVO: las
   * guardadas se recalculan contra la base de hoy (misma materia prima
   * para todas: un solo viaje por clientes y otro por cotizaciones).
   */
  async listarAudiencias(companyId: number) {
    const [guardadas, clientes, cotizaciones, contactos, suprimidos] =
      await Promise.all([
        this.repo.audienciasGuardadas(companyId),
        this.repo.clientesSegmentables(companyId),
        this.repo.cotizacionesSegmentables(companyId),
        this.repo.contactosDeClientes(companyId),
        this.repo.suprimidos(companyId),
      ]);
    const hoy = new Date().toISOString().slice(0, 10);
    const contar = (filtro: FiltroSegmento) =>
      resolverSegmento(clientes, cotizaciones, contactos, filtro, hoy).filter(
        (d) => !suprimidos.has(d.email.toLowerCase()),
      ).length;
    return {
      guardadas: guardadas.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        filtro: a.filtro,
        total: contar(a.filtro as FiltroSegmento),
      })),
      clientes_con_correo: contar({}),
    };
  }

  borrarAudiencia(id: number, companyId: number) {
    return this.repo.borrarAudiencia(id, companyId);
  }
}
