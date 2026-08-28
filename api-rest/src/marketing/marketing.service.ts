import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';
import { BajasService } from './bajas.service';
import {
  AudienciaElegidaDto,
  CrearAudienciaDto,
  CrearCampanaDto,
  EditarCampanaDto,
  ImportarContactosDto,
  PreviaSegmentoDto,
} from './dto/marketing.dto';
import {
  AudienciaDeCampana,
  CampanaMarketing,
  MarketingRepository,
} from './marketing.repository';
import {
  cuerpoAHtml,
  MarcaEmpresa,
  personalizar,
  plantillaCampana,
  resolverDestinatarios,
  validarAsuntoDeReenvio,
} from './plantilla';
import { FiltroSegmento, resolverSegmento } from './segmento';

/** Lote del batch de Resend: hasta 100 por llamada; 40 deja aire. */
const LOTE = 40;

@Injectable()
export class MarketingService {
  constructor(
    private readonly repo: MarketingRepository,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    // La puerta pública (baja firmada + webhook) vive en su propia
    // pieza desde el 27-08: la cerca de tamaño pilló a este archivo.
    private readonly bajas: BajasService,
  ) {
    this.logger.setContext(MarketingService.name);
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
  private async resolverSegmentoDe(companyId: number, filtro: FiltroSegmento) {
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

  // ---- Campañas ----
  /** Valida y normaliza UNA audiencia elegida; para las guardadas
   *  trae el nombre y la foto del filtro de hoy. */
  private async normalizarAudiencia(
    a: AudienciaElegidaDto,
    companyId: number,
  ): Promise<{ entrada: AudienciaDeCampana; nombre: string }> {
    if (a.audiencia_tipo === 'importada' && !a.audiencia_ref) {
      throw new BadRequestException('Falta la audiencia importada');
    }
    if (a.audiencia_tipo === 'clientes' && !a.tipos_cliente?.length) {
      throw new BadRequestException('Elige al menos un tipo de cliente');
    }
    let ref = a.audiencia_ref?.trim() || null;
    let filtro: Record<string, unknown> | null =
      (a.filtro as Record<string, unknown> | undefined) ?? null;
    if (a.audiencia_tipo === 'segmento') {
      if (a.audiencia_id != null) {
        const aud = await this.repo.audienciaGuardada(
          a.audiencia_id,
          companyId,
        );
        if (!aud) {
          throw new BadRequestException('Una audiencia elegida ya no existe');
        }
        ref = aud.nombre;
        filtro = aud.filtro;
      } else if (!filtro) {
        throw new BadRequestException('Elige una audiencia para la campaña');
      }
    }
    return {
      entrada: {
        audiencia_tipo: a.audiencia_tipo,
        audiencia_id: a.audiencia_id ?? null,
        audiencia_ref: ref,
        tipos_cliente: a.tipos_cliente ?? null,
        filtro,
      },
      nombre:
        ref ??
        (a.audiencia_tipo === 'clientes'
          ? `Clientes: ${(a.tipos_cliente ?? []).join(', ')}`
          : 'segmento'),
    };
  }

  async crearCampana(dto: CrearCampanaDto, companyId: number) {
    // SELECCIÓN MÚLTIPLE (27-08): si vienen varias, se guardan todas y
    // las columnas viejas quedan de espejo (primera + nombre combinado).
    if (dto.audiencias?.length) {
      const normalizadas: AudienciaDeCampana[] = [];
      const nombres: string[] = [];
      for (const a of dto.audiencias) {
        const { entrada, nombre } = await this.normalizarAudiencia(
          a,
          companyId,
        );
        normalizadas.push(entrada);
        nombres.push(nombre);
      }
      const primera = normalizadas[0];
      const sola = normalizadas.length === 1;
      return this.repo.crearCampana({
        company_id: companyId,
        nombre: dto.nombre.trim(),
        asunto: dto.asunto.trim(),
        titulo: dto.titulo.trim(),
        cuerpo: dto.cuerpo,
        preencabezado: dto.preencabezado?.trim() || null,
        audiencia_tipo: primera.audiencia_tipo,
        audiencia_id: sola ? primera.audiencia_id : null,
        audiencia_ref: nombres.join(' + ').slice(0, 120),
        tipos_cliente: sola ? primera.tipos_cliente : null,
        filtro: sola ? primera.filtro : null,
        audiencias: normalizadas,
        banner_url: dto.banner_url?.trim() || null,
        whatsapp: dto.whatsapp?.trim() || null,
      });
    }
    if (!dto.audiencia_tipo) {
      throw new BadRequestException('Elige al menos una audiencia');
    }
    if (dto.audiencia_tipo === 'importada' && !dto.audiencia_ref) {
      throw new BadRequestException('Falta la audiencia importada');
    }
    if (dto.audiencia_tipo === 'clientes' && !dto.tipos_cliente?.length) {
      throw new BadRequestException('Elige al menos un tipo de cliente');
    }
    if (
      dto.audiencia_tipo === 'segmento' &&
      dto.audiencia_id == null &&
      !dto.filtro
    ) {
      throw new BadRequestException('Elige una audiencia para la campaña');
    }
    // Audiencia guardada elegida: la campaña apunta a ella (consulta
    // viva al enviar) y guarda una FOTO del filtro por si se borra.
    let audienciaRef = dto.audiencia_ref?.trim() || null;
    let filtro: Record<string, unknown> | null =
      (dto.filtro as Record<string, unknown> | undefined) ?? null;
    if (dto.audiencia_tipo === 'segmento' && dto.audiencia_id != null) {
      const aud = await this.repo.audienciaGuardada(
        dto.audiencia_id,
        companyId,
      );
      if (!aud) throw new BadRequestException('Esa audiencia ya no existe');
      audienciaRef = aud.nombre;
      filtro = aud.filtro;
    }
    return this.repo.crearCampana({
      company_id: companyId,
      nombre: dto.nombre.trim(),
      asunto: dto.asunto.trim(),
      titulo: dto.titulo.trim(),
      cuerpo: dto.cuerpo,
      preencabezado: dto.preencabezado?.trim() || null,
      audiencia_tipo: dto.audiencia_tipo,
      audiencia_id: dto.audiencia_id ?? null,
      audiencia_ref: audienciaRef,
      tipos_cliente: dto.tipos_cliente ?? null,
      filtro,
      banner_url: dto.banner_url?.trim() || null,
      whatsapp: dto.whatsapp?.trim() || null,
    });
  }

  campanas(companyId: number) {
    return this.repo.campanas(companyId);
  }

  private async candidatosDeUna(a: AudienciaDeCampana, companyId: number) {
    if (a.audiencia_tipo === 'importada') {
      return this.repo.contactosDeAudiencia(companyId, a.audiencia_ref!);
    }
    if (a.audiencia_tipo === 'segmento') {
      // CONSULTA VIVA: si apunta a una audiencia guardada, manda el
      // filtro DE HOY; la foto guardada queda de respaldo por si la
      // audiencia se borró.
      let filtro = (a.filtro ?? {}) as FiltroSegmento;
      if (a.audiencia_id != null) {
        const aud = await this.repo.audienciaGuardada(
          a.audiencia_id,
          companyId,
        );
        if (aud) filtro = aud.filtro as FiltroSegmento;
      }
      return this.resolverSegmentoDe(companyId, filtro);
    }
    return this.repo.clientesPorTipo(companyId, a.tipos_cliente ?? []);
  }

  private async candidatosDe(campana: CampanaMarketing, companyId: number) {
    // SELECCIÓN MÚLTIPLE: la unión de todas las audiencias; el dedupe
    // por correo lo hace resolverDestinatarios, así que quien está en
    // dos audiencias recibe UN solo correo.
    if (campana.audiencias?.length) {
      const listas = await Promise.all(
        campana.audiencias.map((a) => this.candidatosDeUna(a, companyId)),
      );
      return listas.flat();
    }
    return this.candidatosDeUna(campana, companyId);
  }

  /** Cuántos recibirían HOY la campaña (para el confirmar del front). */
  async destinatariosDe(id: number, companyId: number) {
    const campana = await this.repo.campana(id, companyId);
    if (!campana) throw new NotFoundException('No existe esa campaña');
    const [candidatos, suprimidos, yaEnviados] = await Promise.all([
      this.candidatosDe(campana, companyId),
      this.repo.suprimidos(companyId),
      this.repo.enviosDe(id),
    ]);
    const lista = resolverDestinatarios(candidatos, suprimidos, yaEnviados);
    return { destinatarios: lista.length };
  }

  /** El origen del frontend: ahí viven el formulario público y los
   *  íconos del pie (public/correo). */
  private baseFrontend(): string {
    return (
      this.config.get<string>('FRONTEND_URL') ?? 'https://www.eventi-app.com'
    ).replace(/\/+$/, '');
  }

  /** El formulario público de cotización de la empresa: el botón por
   *  defecto de todo correo de marketing (decisión de Felipe 25-08). */
  private urlDeCotizar(companyId: number): string {
    return `${this.baseFrontend()}/public-quotation/${String(companyId)}`;
  }

  private renderizar(
    campana: CampanaMarketing,
    destinatario: {
      email: string;
      name: string | null;
      empresa: string | null;
    },
    marca: MarcaEmpresa,
    companyId: number,
  ) {
    const titulo = personalizar(campana.titulo, destinatario);
    const cuerpo = cuerpoAHtml(personalizar(campana.cuerpo, destinatario));
    // EL PUNTO ÚNICO DEL REEMPLAZO (Felipe 28-08): si la campaña trae
    // banner o WhatsApp propios, mandan sobre la marca — y como todo
    // pasa por acá, cubre prueba, envío, segunda pasada y vista.
    const marcaDeCampana: MarcaEmpresa = {
      ...marca,
      ...(campana.banner_url?.trim()
        ? { banner: campana.banner_url.trim() }
        : {}),
      ...(campana.whatsapp?.trim()
        ? { whatsapp: campana.whatsapp.trim() }
        : {}),
    };
    return {
      asunto: personalizar(campana.asunto, destinatario),
      html: plantillaCampana({
        marca: marcaDeCampana,
        titulo,
        cuerpoHtml: cuerpo,
        bajaUrl: this.bajas.urlDeBaja(
          companyId,
          destinatario.email,
          campana.id,
        ),
        cotizarUrl: this.urlDeCotizar(companyId),
        iconosBase: this.baseFrontend(),
        preencabezado: campana.preencabezado
          ? personalizar(campana.preencabezado, destinatario)
          : null,
      }),
    };
  }

  private remitente(nombreEmpresa: string): string {
    // Deuda anotada en el doc 11: cuando Felipe configure el subdominio
    // de marketing en Resend, MARKETING_FROM lo toma sin tocar código.
    return (
      this.config.get<string>('MARKETING_FROM') ??
      `${nombreEmpresa} <hola@eventi-app.com>`
    );
  }

  async enviarPrueba(
    id: number,
    companyId: number,
    correoUsuario: string,
    marca: MarcaEmpresa,
  ) {
    const campana = await this.repo.campana(id, companyId);
    if (!campana) throw new NotFoundException('No existe esa campaña');
    const r = this.renderizar(
      campana,
      { email: correoUsuario, name: 'Prueba', empresa: 'Prueba' },
      marca,
      companyId,
    );
    const resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    const { error } = await resend.emails.send({
      from: this.remitente(marca.nombre),
      to: [correoUsuario],
      subject: `[PRUEBA] ${r.asunto}`,
      html: r.html,
      headers: this.bajas.cabecerasDeBaja(companyId, correoUsuario, id),
      ...(marca.replyTo ? { replyTo: marca.replyTo } : {}),
    });
    if (error) throw new BadRequestException(`Resend: ${error.message}`);
    await this.repo.actualizarCampana(id, companyId, {
      prueba_enviada_at: new Date().toISOString(),
    });
    return { enviada_a: correoUsuario };
  }

  /** Editar un borrador desde su ficha (Felipe 26-08). La enviada es
   *  registro histórico: no se toca. Y editar INVALIDA la prueba —
   *  "sin prueba no hay envío" vale para la versión REAL del correo. */
  async editarCampana(id: number, companyId: number, dto: EditarCampanaDto) {
    const campana = await this.repo.campana(id, companyId);
    if (!campana) throw new NotFoundException('No existe esa campaña');
    if (campana.estado !== 'borrador') {
      throw new BadRequestException(
        'Una campaña enviada no se edita: es el registro de lo que salió',
      );
    }
    return this.repo.actualizarCampana(id, companyId, {
      asunto: dto.asunto.trim(),
      titulo: dto.titulo.trim(),
      cuerpo: dto.cuerpo,
      preencabezado: dto.preencabezado?.trim() || null,
      banner_url: dto.banner_url?.trim() || null,
      whatsapp: dto.whatsapp?.trim() || null,
      prueba_enviada_at: null,
    });
  }

  // ---- Fase 2: lo que pasó con cada correo ----

  resultadosDe(id: number, companyId: number) {
    return this.repo.resultadosDe(id, companyId);
  }

  /**
   * LA FICHA DE LA CAMPAÑA (Felipe 26-08): los KPIs de la industria
   * (entrega, apertura, clics, CTOR, rebotes) + cada destinatario con
   * sus sellos. Tasas sobre ENTREGADOS, como miden los grandes.
   */
  async detalleDe(id: number, companyId: number) {
    const campana = await this.repo.campana(id, companyId);
    if (!campana) throw new NotFoundException('No existe esa campaña');
    const [filas, bajas] = await Promise.all([
      this.repo.destinatariosDetalle(id, companyId),
      this.repo.bajasDe(id, companyId),
    ]);
    const seBajaron = new Set(bajas);
    const enviados = filas.filter((f) => f.estado === 'enviado').length;
    const rebotes = filas.filter((f) => f.bounced_at).length;
    const entregados = Math.max(0, enviados - rebotes);
    const aperturas = filas.filter((f) => f.opened_at).length;
    const clics = filas.filter((f) => f.clicked_at).length;
    const reenviados = filas.filter((f) => f.reenviado_at).length;
    const pct = (parte: number, todo: number) =>
      todo > 0 ? Math.round((parte / todo) * 1000) / 10 : 0;
    return {
      campana,
      kpis: {
        enviados,
        entregados,
        tasa_entrega: pct(entregados, enviados),
        aperturas,
        tasa_apertura: pct(aperturas, entregados),
        clics,
        tasa_clics: pct(clics, entregados),
        ctor: pct(clics, aperturas),
        rebotes,
        tasa_rebote: pct(rebotes, enviados),
        reenviados,
        bajas: seBajaron.size,
        tasa_baja: pct(seBajaron.size, entregados),
      },
      destinatarios: filas.map((f) => ({
        ...f,
        baja: seBajaron.has(f.email.toLowerCase()),
      })),
    };
  }

  /** El correo TAL COMO SALIÓ, renderizado con la marca de hoy: la
   *  vista previa de la ficha (con los respaldos de personalización). */
  async htmlDe(id: number, companyId: number, marca: MarcaEmpresa) {
    const campana = await this.repo.campana(id, companyId);
    if (!campana) throw new NotFoundException('No existe esa campaña');
    const r = this.renderizar(
      campana,
      { email: 'vista-previa@eventia', name: null, empresa: null },
      marca,
      companyId,
    );
    return { html: r.html, asunto: r.asunto };
  }

  /** Cuántos recibirían la segunda pasada (no abrieron, sin rebote,
   *  sin reenvío previo, no suprimidos). */
  async sinAbrirDe(id: number, companyId: number) {
    const [filas, suprimidos] = await Promise.all([
      this.repo.sinAbrirDe(id, companyId),
      this.repo.suprimidos(companyId),
    ]);
    return filas.filter((f) => !suprimidos.has(f.email.toLowerCase()));
  }

  /**
   * EL REENVÍO (Felipe: "reenviar a los que no abrieron"): una sola
   * segunda pasada por destinatario, con asunto variante, solo sobre
   * una campaña ya enviada.
   */
  async reenviarANoAbiertos(
    id: number,
    companyId: number,
    marca: MarcaEmpresa,
    asuntoVariante?: string,
  ) {
    const campana = await this.repo.campana(id, companyId);
    if (!campana) throw new NotFoundException('No existe esa campaña');
    if (campana.estado !== 'enviada') {
      throw new BadRequestException('Esa campaña todavía no se envía');
    }
    // EL TOPE DE LA INDUSTRIA (Felipe 26-08): máximo 2 envíos por
    // campaña — el original y UNA segunda pasada. Una tercera va justo
    // al grupo menos interesado: suben los reclamos de spam y eso quema
    // la reputación del remitente (la llegada de TODO lo futuro).
    if (campana.reenviada_con_asunto) {
      throw new BadRequestException(
        'Esta campaña ya tuvo su segunda pasada; el máximo sano son 2 envíos',
      );
    }
    const pendientes = await this.sinAbrirDe(id, companyId);
    if (pendientes.length === 0) {
      throw new BadRequestException('No queda nadie sin abrir por reenviar');
    }
    // LA REGLA DEL MANUAL: la segunda pasada exige asunto nuevo.
    const validado = validarAsuntoDeReenvio(campana.asunto, asuntoVariante);
    if ('error' in validado) throw new BadRequestException(validado.error);
    const asunto = validado.asunto;
    const resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    const from = this.remitente(marca.nombre);
    let enviados = 0;
    for (let i = 0; i < pendientes.length; i += LOTE) {
      const lote = pendientes.slice(i, i + LOTE);
      const payloads = lote.map((d) => {
        const r = this.renderizar(
          { ...campana, asunto },
          { email: d.email, name: d.name, empresa: d.empresa ?? d.name },
          marca,
          companyId,
        );
        return {
          from,
          to: [d.email],
          subject: r.asunto,
          html: r.html,
          headers: this.bajas.cabecerasDeBaja(companyId, d.email, id),
          ...(marca.replyTo ? { replyTo: marca.replyTo } : {}),
        };
      });
      const { error } = await resend.batch.send(payloads);
      if (error) {
        throw new BadRequestException(`Resend: ${error.message}`);
      }
      await this.repo.marcarReenviados(lote.map((d) => d.id));
      enviados += lote.length;
    }
    await this.repo.actualizarCampana(id, companyId, {
      reenviada_con_asunto: asunto,
    });
    this.logger.info(`reenvío campaña ${id}: ${enviados} sin-abrir`);
    return { reenviados: enviados };
  }

  async enviarCampana(
    id: number,
    companyId: number,
    marca: MarcaEmpresa,
    copiaPara?: string,
  ) {
    const campana = await this.repo.campana(id, companyId);
    if (!campana) throw new NotFoundException('No existe esa campaña');
    if (campana.estado !== 'borrador') {
      throw new BadRequestException('Esa campaña ya se envió');
    }
    // SIN PRUEBA NO HAY ENVÍO (regla 4 del doc 11).
    if (!campana.prueba_enviada_at) {
      throw new BadRequestException(
        'Primero mándate la prueba a tu casilla: sin prueba no hay envío',
      );
    }
    const [candidatos, suprimidos, yaEnviados] = await Promise.all([
      this.candidatosDe(campana, companyId),
      this.repo.suprimidos(companyId),
      this.repo.enviosDe(id),
    ]);
    const lista = resolverDestinatarios(candidatos, suprimidos, yaEnviados);
    if (lista.length === 0) {
      throw new BadRequestException('La audiencia quedó vacía');
    }
    // LA COPIA DEL CAPITÁN (Felipe 26-08): toda campaña real le llega
    // también a quien la despachó, registrada como un enviado más —
    // ve en su casilla EXACTAMENTE lo que recibieron los clientes.
    // Si ya estaba en la audiencia, no se duplica.
    const copia = copiaPara?.trim().toLowerCase();
    if (copia && !lista.some((d) => d.email.toLowerCase() === copia)) {
      lista.push({ email: copia, name: null, empresa: null });
    }

    const resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    const from = this.remitente(marca.nombre);
    let enviados = 0;
    let fallidos = 0;
    for (let i = 0; i < lista.length; i += LOTE) {
      const lote = lista.slice(i, i + LOTE);
      const payloads = lote.map((d) => {
        const r = this.renderizar(campana, d, marca, companyId);
        return {
          from,
          to: [d.email],
          subject: r.asunto,
          html: r.html,
          headers: this.bajas.cabecerasDeBaja(companyId, d.email, id),
          ...(marca.replyTo ? { replyTo: marca.replyTo } : {}),
        };
      });
      const { data, error } = await resend.batch.send(payloads);
      const registros = lote.map((d, j) => ({
        company_id: companyId,
        campaign_id: id,
        email: d.email,
        name: d.name,
        empresa: d.empresa,
        estado: error ? 'fallido' : 'enviado',
        error: error ? error.message : null,
        resend_id: error ? null : (data?.data?.[j]?.id ?? null),
      }));
      await this.repo.registrarEnvios(registros);
      if (error) fallidos += lote.length;
      else enviados += lote.length;
    }
    await this.repo.actualizarCampana(id, companyId, {
      estado: 'enviada',
      enviada_at: new Date().toISOString(),
      total_destinatarios: enviados,
    });
    this.logger.info(
      `campaña ${id} enviada: ${enviados} ok, ${fallidos} fallidos`,
    );
    return { enviados, fallidos };
  }
}
