import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';
import { CrearCampanaDto, ImportarContactosDto } from './dto/marketing.dto';
import { CampanaMarketing, MarketingRepository } from './marketing.repository';
import {
  cuerpoAHtml,
  personalizar,
  plantillaCampana,
  resolverDestinatarios,
} from './plantilla';

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

  urlDeBaja(companyId: number, email: string): string {
    const base =
      this.config.get<string>('PUBLIC_API_URL') ??
      'https://api-rest-production-d404.up.railway.app';
    const e = Buffer.from(email.toLowerCase()).toString('base64url');
    return `${base}/marketing/baja?c=${String(companyId)}&e=${e}&t=${this.firmaDeBaja(companyId, email)}`;
  }

  async procesarBaja(c: string, e: string, t: string): Promise<boolean> {
    const companyId = Number(c);
    const email = Buffer.from(e, 'base64url').toString('utf8');
    if (!companyId || !email.includes('@')) return false;
    if (this.firmaDeBaja(companyId, email) !== t) return false;
    await this.repo.suprimir(companyId, email, 'baja');
    this.logger.info(`baja de marketing: ${email}`);
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

  audienciasImportadas(companyId: number) {
    return this.repo.audienciasImportadas(companyId);
  }

  tiposDeCliente(companyId: number) {
    return this.repo.tiposDeCliente(companyId);
  }

  // ---- Campañas ----
  async crearCampana(dto: CrearCampanaDto, companyId: number) {
    if (dto.audiencia_tipo === 'importada' && !dto.audiencia_ref) {
      throw new BadRequestException('Falta la audiencia importada');
    }
    if (dto.audiencia_tipo === 'clientes' && !dto.tipos_cliente?.length) {
      throw new BadRequestException('Elige al menos un tipo de cliente');
    }
    return this.repo.crearCampana({
      company_id: companyId,
      nombre: dto.nombre.trim(),
      asunto: dto.asunto.trim(),
      titulo: dto.titulo.trim(),
      cuerpo: dto.cuerpo,
      boton_texto: dto.boton_texto?.trim() || null,
      boton_url: dto.boton_url?.trim() || null,
      audiencia_tipo: dto.audiencia_tipo,
      audiencia_ref: dto.audiencia_ref?.trim() || null,
      tipos_cliente: dto.tipos_cliente ?? null,
    });
  }

  campanas(companyId: number) {
    return this.repo.campanas(companyId);
  }

  private async candidatosDe(campana: CampanaMarketing, companyId: number) {
    return campana.audiencia_tipo === 'importada'
      ? this.repo.contactosDeAudiencia(companyId, campana.audiencia_ref!)
      : this.repo.clientesPorTipo(companyId, campana.tipos_cliente ?? []);
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

  private renderizar(
    campana: CampanaMarketing,
    destinatario: {
      email: string;
      name: string | null;
      empresa: string | null;
    },
    nombreEmpresa: string,
    companyId: number,
  ) {
    const titulo = personalizar(campana.titulo, destinatario);
    const cuerpo = cuerpoAHtml(personalizar(campana.cuerpo, destinatario));
    return {
      asunto: personalizar(campana.asunto, destinatario),
      html: plantillaCampana({
        empresa: nombreEmpresa,
        titulo,
        cuerpoHtml: cuerpo,
        botonTexto: campana.boton_texto,
        botonUrl: campana.boton_url,
        bajaUrl: this.urlDeBaja(companyId, destinatario.email),
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
    nombreEmpresa: string,
  ) {
    const campana = await this.repo.campana(id, companyId);
    if (!campana) throw new NotFoundException('No existe esa campaña');
    const r = this.renderizar(
      campana,
      { email: correoUsuario, name: 'Prueba', empresa: 'Prueba' },
      nombreEmpresa,
      companyId,
    );
    const resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    const { error } = await resend.emails.send({
      from: this.remitente(nombreEmpresa),
      to: [correoUsuario],
      subject: `[PRUEBA] ${r.asunto}`,
      html: r.html,
    });
    if (error) throw new BadRequestException(`Resend: ${error.message}`);
    await this.repo.actualizarCampana(id, companyId, {
      prueba_enviada_at: new Date().toISOString(),
    });
    return { enviada_a: correoUsuario };
  }

  async enviarCampana(id: number, companyId: number, nombreEmpresa: string) {
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
    const from = this.remitente(nombreEmpresa);
    let enviados = 0;
    let fallidos = 0;
    for (let i = 0; i < lista.length; i += LOTE) {
      const lote = lista.slice(i, i + LOTE);
      const payloads = lote.map((d) => {
        const r = this.renderizar(campana, d, nombreEmpresa, companyId);
        return { from, to: [d.email], subject: r.asunto, html: r.html };
      });
      const { data, error } = await resend.batch.send(payloads);
      const registros = lote.map((d, j) => ({
        company_id: companyId,
        campaign_id: id,
        email: d.email,
        name: d.name,
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
