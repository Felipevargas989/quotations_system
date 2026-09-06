import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import chromium from '@sparticuz/chromium';
import { PinoLogger } from 'nestjs-pino';
import puppeteer from 'puppeteer-core';
import { Resend } from 'resend';
import { ClientContactsRepository } from 'src/clients/client-contacts.controller';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { marcaDesdeFila } from 'src/marketing/marca';
import { plantillaCampana } from 'src/marketing/plantilla';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { User } from 'src/users/entities/user.entity';
import { correoDeCotizacion, reparosDelPortero } from './correo-cotizacion';
import type { Quotation } from './entities/quotation.entity';
import { firmarTokenImpresion, validarTokenImpresion } from './firma-impresion';
import { listaBlancaDeHoja } from './hoja-publica';
import { QuotationsRepository } from './quotations.repository';

/** La marca con que la bitácora reconoce un envío de cotización. Se
 *  usa al ESCRIBIR la nota y al CONTAR versiones — cambiarla rompe el
 *  conteo de las notas históricas: no tocar sin migrar los textos. */
const MARCA_DE_ENVIO = 'Cotización enviada por correo';

type CotizacionConCliente = Quotation & {
  clients?: { name?: string | null; email?: string | null } | null;
};

/**
 * ENVIAR COTIZACIÓN POR CORREO (doc 13): el correo tipo con el
 * detalle en el cuerpo y el PDF adjunto que genera el MOTOR — un
 * navegador invisible abre la hoja pública de impresión del frontend
 * (la MISMA hoja del visor y del portal) y la imprime. Jamás un
 * segundo diseño de PDF.
 */
@Injectable()
export class EnvioCotizacionService {
  constructor(
    private readonly quotationsRepository: QuotationsRepository,
    private readonly contactos: ClientContactsRepository,
    private readonly companies: CompaniesRepository,
    private readonly followups: QuotationFollowupsService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EnvioCotizacionService.name);
  }

  /** El mismo secreto de las bajas de marketing (doc 11). */
  private secreto(): string {
    return (
      this.config.get<string>('MARKETING_BAJA_SECRET') ??
      (this.config.get<string>('RESEND_API_KEY') as string)
    );
  }

  private frontendUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL') ?? 'https://www.eventi-app.com'
    ).replace(/\/+$/, '');
  }

  /**
   * La puerta pública del navegador invisible: token firmado de corta
   * vida → los datos de la hoja, con la MISMA lista blanca del portal.
   * Token vencido o adulterado = 404 sin pistas.
   */
  async hojaParaImprimir(token: string) {
    const id = validarTokenImpresion(token, this.secreto(), Date.now());
    if (!id) throw new NotFoundException();
    const { data: q } = await this.quotationsRepository.findOne(id);
    if (!q) throw new NotFoundException();
    const { data: empresa } = await this.companies.findOne(q.company_id);
    return {
      quotation: listaBlancaDeHoja(q),
      empresa: {
        name: empresa?.name || '',
        logo_url: empresa?.logo_url || null,
        colors: empresa?.colors || null,
      },
      menu: await this.quotationsRepository.cartaDelCatalogo(q.company_id),
    };
  }

  /**
   * El correo de destino, con la regla de la ficha del negocio: el
   * contacto de la cotización (por vínculo real o por nombre) y su
   * correo; si no hay, el correo del cliente.
   */
  private async correoDeDestino(q: CotizacionConCliente): Promise<{
    correo: string | null;
    nombre: string | null;
  }> {
    const nombreContacto = q.contact_name?.trim() || null;
    if (q.client_id && (q.client_contact_id || nombreContacto)) {
      const lista = (await this.contactos.findByClient(
        q.company_id,
        q.client_id,
      )) as { id?: number; name?: string; email?: string }[];
      const contacto =
        lista.find((c) => c.id === q.client_contact_id) ||
        lista.find(
          (c) =>
            (c.name || '').trim().toLowerCase() ===
            nombreContacto?.toLowerCase(),
        );
      const correo = (contacto?.email || '').trim();
      if (correo) {
        return { correo, nombre: contacto?.name || nombreContacto };
      }
    }
    return {
      correo: q.clients?.email?.trim() || null,
      nombre: nombreContacto || q.clients?.name || null,
    };
  }

  /** Imprime la hoja pública con el navegador invisible. */
  private async generarPdf(quotationId: string): Promise<Buffer> {
    const token = firmarTokenImpresion(quotationId, this.secreto(), Date.now());
    const url = `${this.frontendUrl()}/imprimir/${token}`;
    // En Railway el binario empaquetado de @sparticuz/chromium; en una
    // máquina de desarrollo, el Chrome local vía PUPPETEER_EXECUTABLE_PATH.
    const rutaLocal = this.config.get<string>('PUPPETEER_EXECUTABLE_PATH');
    const browser = await puppeteer.launch({
      args: rutaLocal
        ? ['--no-sandbox', '--disable-dev-shm-usage']
        : chromium.args,
      executablePath: rutaLocal || (await chromium.executablePath()),
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 45_000 });
      // La hoja pinta .qv-hoja cuando los datos llegaron.
      await page.waitForSelector('.qv-hoja', { timeout: 15_000 });
      // Y la letra de la casa (Inter, en la pieza compartida) debe
      // estar descargada antes de imprimir — sin esto el PDF puede
      // salir con la fuente de respaldo del servidor. CON TOPE
      // (revisión 06-09): si el CDN de fuentes se pega, mejor un PDF
      // con la letra de respaldo a los 10 s que un envío colgado para
      // siempre — era la única espera sin límite del método.
      await Promise.race([
        page.evaluate(() => document.fonts.ready),
        new Promise((resolve) => setTimeout(resolve, 10_000)),
      ]);
      const pdf = await page.pdf({
        format: 'a4',
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  /** Cotizaciones con un envío EN CURSO (revisión 06-09): el PDF
   *  tarda varios segundos y un reintento del navegador (timeout del
   *  proxy, doble clic) duplicaría el correo al cliente. */
  private readonly enviosEnCurso = new Set<string>();

  /** El circuito completo del botón "Enviar cotización". */
  async enviar(quotationId: string, user: User) {
    if (this.enviosEnCurso.has(quotationId)) {
      throw new BadRequestException(
        'Ya hay un envío de esta cotización en curso: espera unos segundos.',
      );
    }
    this.enviosEnCurso.add(quotationId);
    try {
      return await this.enviarDeVerdad(quotationId, user);
    } finally {
      this.enviosEnCurso.delete(quotationId);
    }
  }

  private async enviarDeVerdad(quotationId: string, user: User) {
    const { data: q } = await this.quotationsRepository.findOne(quotationId);
    if (!q || q.company_id !== user.company_id) {
      throw new NotFoundException('Cotización no encontrada');
    }

    const destino = await this.correoDeDestino(q);
    const reparos = reparosDelPortero(q, destino.correo);
    if (reparos.length) {
      throw new BadRequestException(reparos.join(' '));
    }

    const { data: filaEmpresa, error: errMarca } = await this.companies.findOne(
      q.company_id,
    );
    if (errMarca && errMarca.code !== 'PGRST116') throw errMarca;
    const marca = marcaDesdeFila(filaEmpresa || {});

    // ¿Qué versión es esta? La bitácora es la memoria: los envíos
    // previos + 1. Del 2 en adelante el correo abre con "hemos
    // actualizado tu cotización". OJO: el ASUNTO es idéntico en todas
    // las versiones (hilo único, decisión de Felipe 05-09) — lo que
    // distingue las versiones es el sello con fecha y hora al pie, y
    // los "..." con que Gmail pliega bloques repetidos son cosmético
    // asumido. Best effort: sin bitácora, sale como primera vez.
    let numeroDeVersion = 1;
    try {
      const previos = await this.followups.findByQuotation(
        user.company_id,
        quotationId,
      );
      numeroDeVersion += (previos || []).filter(
        (f: { tipo?: string | null; note?: string | null }) =>
          f.tipo === 'correo' && (f.note || '').startsWith(MARCA_DE_ENVIO),
      ).length;
    } catch (e) {
      this.logger.error(`no se pudo leer la bitácora: ${String(e)}`);
    }

    this.logger.info(`enviar cotizacion ${quotationId} a ${destino.correo}`);
    const pdf = await this.generarPdf(quotationId);
    const archivo = `Cotizacion_N${String(q.quotation_number)}_${marca.nombre.replace(/[^\p{L}\p{N}]+/gu, '')}.pdf`;

    const { asunto, titulo, cuerpoHtml } = correoDeCotizacion(
      q,
      marca,
      destino.nombre,
      numeroDeVersion,
    );
    const resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    const { error } = await resend.emails.send({
      from: `${marca.nombre} <hola@eventi-app.com>`,
      to: [destino.correo as string],
      subject: asunto,
      html: plantillaCampana({
        marca,
        titulo,
        cuerpoHtml,
        iconosBase: this.frontendUrl(),
      }),
      attachments: [{ filename: archivo, content: pdf.toString('base64') }],
      // Las respuestas van al buzón de la empresa si está configurado;
      // si no, al vendedor que envió.
      ...(marca.replyTo || user.email
        ? { replyTo: marca.replyTo || user.email }
        : {}),
    });
    if (error) throw new BadRequestException(error.message);

    // La anotación en la bitácora de Seguimiento. Si fallara, el
    // correo YA salió: se registra el error, no se rompe el envío.
    try {
      await this.followups.create(user, {
        quotation_id: quotationId,
        note: `${MARCA_DE_ENVIO} a ${destino.correo as string}${
          numeroDeVersion > 1 ? ` (versión ${String(numeroDeVersion)})` : ''
        }, con el PDF adjunto.`,
        tipo: 'correo',
      });
    } catch (e) {
      this.logger.error(`bitácora del envío falló: ${String(e)}`);
    }

    return { enviado_a: destino.correo };
  }
}
