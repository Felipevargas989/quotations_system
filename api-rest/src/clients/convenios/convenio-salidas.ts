import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import chromium from '@sparticuz/chromium';
import { PinoLogger } from 'nestjs-pino';
import puppeteer from 'puppeteer-core';
import { Resend } from 'resend';

/**
 * Lo que sale del convenio hacia afuera (doc 24), aparte para poder
 * simularlo en las pruebas: el PDF y los correos.
 */

/**
 * El PDF del convenio: el mismo navegador invisible del envío de
 * cotizaciones (doc 13, `puppeteer-core` + `@sparticuz/chromium`), pero con
 * la hoja armada en el motor (`page.setContent`): el contrato no es una hoja
 * del frontend. Un PDF a la vez y el navegador se cierra siempre.
 */
@Injectable()
export class ImpresoraDeConvenios {
  private cola: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ImpresoraDeConvenios.name);
  }

  imprimir(html: string): Promise<Buffer> {
    const turno = this.cola.then(() => this.imprimirAhora(html));
    this.cola = turno.catch(() => undefined);
    return turno;
  }

  private async imprimirAhora(html: string): Promise<Buffer> {
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
      // Sin red: la hoja trae todo adentro (letras del sistema).
      await page.setJavaScriptEnabled(false);
      await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
      const pdf = await page.pdf({
        format: 'a4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="font-size:8px;width:100%;text-align:center;color:#6b7280;font-family:Arial"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}

export interface CorreoDelConvenio {
  de: string;
  para: string[];
  copiaOculta?: string[];
  responderA?: string | null;
  asunto: string;
  html: string;
  adjuntos?: { filename: string; content: string }[];
}

/** Los correos del convenio, por Resend como todo Eventia. */
@Injectable()
export class CorreosDeConvenios {
  constructor(private readonly config: ConfigService) {}

  async enviar(c: CorreoDelConvenio): Promise<void> {
    const resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    const { error } = await resend.emails.send({
      from: c.de,
      to: c.para,
      ...(c.copiaOculta?.length ? { bcc: c.copiaOculta } : {}),
      subject: c.asunto,
      html: c.html,
      ...(c.adjuntos?.length ? { attachments: c.adjuntos } : {}),
      ...(c.responderA ? { replyTo: c.responderA } : {}),
    });
    if (error) throw new Error(error.message);
  }
}
