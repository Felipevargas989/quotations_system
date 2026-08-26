import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';
import {
  CrearAudienciaDto,
  CrearCampanaDto,
  ImportarContactosDto,
  PreviaSegmentoDto,
} from './dto/marketing.dto';
import { CampanaMarketing, MarketingRepository } from './marketing.repository';
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
  ) {
    this.logger.setContext(MarketingService.name);
  }

  // ---- La baja firmada: HMAC del correo, sin sesión ----
  private secreto(): string {
    return (
      this.config.get<string>('MARKETING_BAJA_SECRET') ??
      (this.config.get<string>('RESEND_API_KEY') as string)
    );
  }

  firmaDeBaja(companyId: number, email: string): string {
    return createHmac('sha256', this.secreto())
      .update(`${companyId}|${email.toLowerCase()}`)
      .digest('hex')
      .slice(0, 32);
  }

  /** La dirección pública de ESTE backend. La lección del 26-08: el
   *  respaldo apuntaba a producción y el enlace de baja del laboratorio
   *  llevaba a una puerta inexistente. Railway inyecta el dominio
   *  propio del servicio: cada ambiente apunta a sí mismo. */
  private baseApi(): string {
    const configurada = this.config.get<string>('PUBLIC_API_URL');
    if (configurada) return configurada.replace(/\/+$/, '');
    const dominio = this.config.get<string>('RAILWAY_PUBLIC_DOMAIN');
    if (dominio) return `https://${dominio}`;
    return 'https://api-rest-production-d404.up.railway.app';
  }

  urlDeBaja(companyId: number, email: string): string {
    const e = Buffer.from(email.toLowerCase()).toString('base64url');
    return `${this.baseApi()}/marketing/baja?c=${String(companyId)}&e=${e}&t=${this.firmaDeBaja(companyId, email)}`;
  }

  /** Valida el enlace de baja SIN ejecutarla. Endurecido (revisión
   *  26-08): parámetros ausentes o basura devuelven null, nunca 500 —
   *  es la ruta que la ley exige que funcione. */
  bajaValida(
    c?: string,
    e?: string,
    t?: string,
  ): { companyId: number; email: string } | null {
    if (
      typeof c !== 'string' ||
      typeof e !== 'string' ||
      typeof t !== 'string'
    ) {
      return null;
    }
    const companyId = Number(c);
    let email = '';
    try {
      email = Buffer.from(e, 'base64url').toString('utf8');
    } catch {
      return null;
    }
    if (!companyId || !email.includes('@')) return null;
    const esperada = Buffer.from(this.firmaDeBaja(companyId, email));
    const dada = Buffer.from(t);
    if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) {
      return null;
    }
    return { companyId, email };
  }

  async procesarBaja(c?: string, e?: string, t?: string): Promise<boolean> {
    const valida = this.bajaValida(c, e, t);
    if (!valida) return false;
    await this.repo.suprimir(valida.companyId, valida.email, 'baja');
    this.logger.info(`baja de marketing: ${valida.email}`);
    return true;
  }

  // ---- Audiencias ----
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
  async crearCampana(dto: CrearCampanaDto, companyId: number) {
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
    });
  }

  campanas(companyId: number) {
    return this.repo.campanas(companyId);
  }

  private async candidatosDe(campana: CampanaMarketing, companyId: number) {
    if (campana.audiencia_tipo === 'importada') {
      return this.repo.contactosDeAudiencia(companyId, campana.audiencia_ref!);
    }
    if (campana.audiencia_tipo === 'segmento') {
      // CONSULTA VIVA: si la campaña apunta a una audiencia guardada,
      // manda el filtro DE HOY de esa audiencia; la foto que guardó la
      // campaña queda solo de respaldo por si la audiencia se borró.
      let filtro = (campana.filtro ?? {}) as FiltroSegmento;
      if (campana.audiencia_id != null) {
        const aud = await this.repo.audienciaGuardada(
          campana.audiencia_id,
          companyId,
        );
        if (aud) filtro = aud.filtro as FiltroSegmento;
      }
      return this.resolverSegmentoDe(companyId, filtro);
    }
    return this.repo.clientesPorTipo(companyId, campana.tipos_cliente ?? []);
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
    return {
      asunto: personalizar(campana.asunto, destinatario),
      html: plantillaCampana({
        marca,
        titulo,
        cuerpoHtml: cuerpo,
        bajaUrl: this.urlDeBaja(companyId, destinatario.email),
        cotizarUrl: this.urlDeCotizar(companyId),
        iconosBase: this.baseFrontend(),
        preencabezado: campana.preencabezado
          ? personalizar(campana.preencabezado, destinatario)
          : null,
      }),
    };
  }

  /** El estándar de baja de los grandes: Gmail/Outlook muestran su
   *  propio botón "Darse de baja" leyendo estas cabeceras, y el POST
   *  de un clic cae en la misma ruta firmada. */
  private cabecerasDeBaja(companyId: number, email: string) {
    return {
      'List-Unsubscribe': `<${this.urlDeBaja(companyId, email)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
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
      headers: this.cabecerasDeBaja(companyId, correoUsuario),
      ...(marca.replyTo ? { replyTo: marca.replyTo } : {}),
    });
    if (error) throw new BadRequestException(`Resend: ${error.message}`);
    await this.repo.actualizarCampana(id, companyId, {
      prueba_enviada_at: new Date().toISOString(),
    });
    return { enviada_a: correoUsuario };
  }

  // ---- Fase 2: lo que pasó con cada correo ----

  /**
   * El webhook de Resend (abierto/click/rebote/queja). Con
   * RESEND_WEBHOOK_SECRET configurado se verifica la firma Svix; sin
   * él se procesa igual (el evento solo marca sellos por resend_id) y
   * queda avisado en el log.
   */
  verificarFirmaSvix(
    payload: string,
    headers: { id?: string; timestamp?: string; firma?: string },
  ): boolean {
    const secreto = this.config.get<string>('RESEND_WEBHOOK_SECRET');
    if (!secreto) {
      // FAIL-CLOSED en producción (revisión 26-08): sin secreto no se
      // acepta nada — antes procesaba igual y cualquiera podía marcar
      // aperturas o suprimir correos a punta de rebotes falsos.
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('webhook sin RESEND_WEBHOOK_SECRET: RECHAZADO');
        return false;
      }
      this.logger.warn('webhook sin RESEND_WEBHOOK_SECRET: sin verificar');
      return true;
    }
    if (!headers.id || !headers.timestamp || !headers.firma) return false;
    // Tolerancia ±5 minutos: una notificación capturada no sirve para
    // siempre (anti-replay, igual que el verificador oficial de Svix).
    const ts = Number(headers.timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
      return false;
    }
    const llave = Buffer.from(secreto.replace(/^whsec_/, ''), 'base64');
    const esperada = createHmac('sha256', llave)
      .update(`${headers.id}.${headers.timestamp}.${payload}`)
      .digest();
    return headers.firma.split(' ').some((f) => {
      const dada = Buffer.from(f.replace(/^v1,/, ''), 'base64');
      return dada.length === esperada.length && timingSafeEqual(dada, esperada);
    });
  }

  async procesarEventoResend(evento: {
    type?: string;
    data?: { email_id?: string };
  }) {
    const resendId = evento.data?.email_id;
    if (!resendId || !evento.type) return { ok: true };
    const ahora = new Date().toISOString();
    const sello: Record<string, unknown> | null =
      evento.type === 'email.opened'
        ? { opened_at: ahora }
        : evento.type === 'email.clicked'
          ? { clicked_at: ahora, opened_at: ahora }
          : evento.type === 'email.bounced' ||
              evento.type === 'email.complained'
            ? { bounced_at: ahora }
            : null;
    if (!sello) return { ok: true };
    const fila = await this.repo.marcarEvento(resendId, sello);
    // EL REBOTE DURO SE SUPRIME SOLO (regla de la Fase 2): no se le
    // insiste nunca más a una casilla que no existe o que reclamó.
    if (fila && sello.bounced_at) {
      await this.repo.suprimir(fila.company_id, fila.email, 'rebote');
      this.logger.info(`rebote suprimido: ${fila.email}`);
    }
    return { ok: true };
  }

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
    const filas = await this.repo.destinatariosDetalle(id, companyId);
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
      },
      destinatarios: filas,
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
          headers: this.cabecerasDeBaja(companyId, d.email),
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

  async enviarCampana(id: number, companyId: number, marca: MarcaEmpresa) {
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
          headers: this.cabecerasDeBaja(companyId, d.email),
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
