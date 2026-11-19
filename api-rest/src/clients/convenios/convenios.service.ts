import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { marcaDesdeFila } from 'src/marketing/marca';
import { plantillaCampana, type MarcaEmpresa } from 'src/marketing/plantilla';
import { formatearRut, normalizarRut } from 'src/people/utils/rut';
import { StorageService } from 'src/storage/storage.service';
import type { User } from 'src/users/entities/user.entity';
import {
  fechaCorta,
  fechaLarga,
  hojaDelConvenio,
  hoyEnChile,
  llenarPlantilla,
  sha256,
  textoParaLeer,
  vencimiento,
  type DatosDelConvenio,
} from './convenio-plantilla';
import { CorreosDeConvenios, ImpresoraDeConvenios } from './convenio-salidas';
import type {
  AceptarConvenioDto,
  AgregarDocumentoDto,
  FirmadoEnPapelDto,
} from './convenio.dto';
import {
  ConveniosRepository,
  type Convenio,
  type PlantillaDeConvenio,
} from './convenios.repository';
import {
  correoDeAviso,
  correoDeCopia,
  correoDeInvitacion,
} from './correo-convenio';

/** La misma respuesta para un enlace que no existe y uno ajeno: sin pistas. */
const ENLACE_NO_VALIDO = 'Este enlace no es válido.';

const nuevoEnlace = (): { token: string; huella: string } => {
  const token = randomBytes(32).toString('base64url');
  return { token, huella: sha256(token) };
};

/** Un enlace con forma de enlace (43 caracteres base64url). */
const tieneFormaDeEnlace = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t);

/**
 * EL CONVENIO DEL CLIENTE (doc 24).
 *
 * La plantilla cuelga de la empresa: sin plantilla no hay convenio (la
 * ficha no muestra la tarjeta). Un cliente tiene a lo más UN convenio
 * vigente (enviado o firmado), cuidado también por la base. Se firma en
 * línea por un enlace personal, o se sube el firmado en papel.
 */
@Injectable()
export class ConveniosService {
  /** Convenios con una firma en curso: un doble clic no firma dos veces. */
  private readonly firmasEnCurso = new Set<string>();
  /** Clientes con un envío en curso. */
  private readonly enviosEnCurso = new Set<string>();

  constructor(
    private readonly repo: ConveniosRepository,
    private readonly companies: CompaniesRepository,
    private readonly storage: StorageService,
    private readonly impresora: ImpresoraDeConvenios,
    private readonly correos: CorreosDeConvenios,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ConveniosService.name);
  }

  private frontendUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL') ?? 'https://www.eventi-app.com'
    ).replace(/\/+$/, '');
  }

  private async marcaDe(companyId: number): Promise<MarcaEmpresa> {
    const { data } = await this.companies.findOne(companyId);
    return marcaDesdeFila(data || {});
  }

  private async clienteDe(companyId: number, clientId: string) {
    const cliente = await this.repo.clienteDe(companyId, clientId);
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    return cliente;
  }

  /** La carpeta de los documentos de un cliente en el balde privado. */
  private carpetaDe(companyId: number, clientId: string) {
    return `c${companyId}/client-documents/${clientId}/`;
  }

  // ------------------------------------------------------------------
  // La ficha
  // ------------------------------------------------------------------

  /** Lo que muestra la tarjeta «Convenio». */
  async estado(clientId: string, user: User) {
    await this.clienteDe(user.company_id, clientId);
    const plantilla = await this.repo.plantillaDe(user.company_id);
    const c = await this.repo.vigente(user.company_id, clientId);
    let documento: { id: number; file_url: string; file_name: string } | null =
      null;
    if (c?.documento_id) {
      const d = await this.repo.documento(user.company_id, c.documento_id);
      if (d) {
        documento = { id: d.id, file_url: d.file_url, file_name: d.file_name };
      }
    }
    return {
      ofrece: !!plantilla,
      plantilla: plantilla
        ? {
            nombre: plantilla.nombre,
            titulo: plantilla.titulo,
            vigencia_anios: plantilla.vigencia_anios,
            beneficios: plantilla.beneficios,
          }
        : null,
      convenio: c
        ? {
            estado: c.estado,
            origen: c.origen,
            enviado_a_correo: c.enviado_a_correo,
            enviado_a_nombre: c.enviado_a_nombre,
            enviado_a_contact_id: c.enviado_a_contact_id,
            enviado_at: c.enviado_at,
            firmado_at: c.firmado_at,
            vence_at: c.vence_at,
            firmante_nombre: c.firmante_nombre,
            firmante_cargo: c.firmante_cargo,
            pdf_pendiente: c.estado === 'firmado' && !documento,
            documento,
          }
        : null,
    };
  }

  /** «Enviar convenio» (y reenviar): cada envío pone un enlace nuevo y el
   *  anterior deja de servir. */
  async enviar(clientId: string, contactId: number, user: User) {
    if (this.enviosEnCurso.has(clientId)) {
      throw new BadRequestException(
        'Ya hay un envío de este convenio en curso: espera unos segundos.',
      );
    }
    this.enviosEnCurso.add(clientId);
    try {
      return await this.enviarDeVerdad(clientId, contactId, user);
    } finally {
      this.enviosEnCurso.delete(clientId);
    }
  }

  private async enviarDeVerdad(
    clientId: string,
    contactId: number,
    user: User,
  ) {
    const companyId = user.company_id;
    const cliente = await this.clienteDe(companyId, clientId);
    const plantilla = await this.repo.plantillaDe(companyId);
    if (!plantilla) {
      throw new BadRequestException('Tu empresa no tiene un convenio cargado.');
    }
    const contacto = await this.repo.contactoDe(companyId, clientId, contactId);
    if (!contacto) throw new NotFoundException('Esa persona no es del cliente');
    const correo = contacto.email?.trim();
    if (!correo) {
      throw new BadRequestException(
        `${contacto.name} no tiene correo: agrégalo en sus datos antes de enviar.`,
      );
    }
    const vigente = await this.repo.vigente(companyId, clientId);
    if (vigente?.estado === 'firmado') {
      throw new ConflictException('Este cliente ya tiene el convenio firmado.');
    }

    const { token, huella } = nuevoEnlace();
    const marca = await this.marcaDe(companyId);
    const enlace = `${this.frontendUrl()}/convenio/${token}`;
    const { asunto, titulo, cuerpoHtml } = correoDeInvitacion({
      empresa: marca.nombre,
      cliente: cliente.name,
      nombre: contacto.name,
      titulo: plantilla.titulo,
      beneficios: plantilla.beneficios,
      enlace,
      color: marca.colorPrimario,
    });

    // Primero el correo: si no sale, la ficha no dice «Enviado».
    const copiaOculta =
      marca.replyTo && marca.replyTo.toLowerCase() !== correo.toLowerCase()
        ? [marca.replyTo]
        : [];
    await this.correos
      .enviar({
        de: `${marca.nombre} <hola@eventi-app.com>`,
        para: [correo],
        copiaOculta,
        responderA: marca.replyTo || user.email || null,
        asunto,
        html: plantillaCampana({
          marca,
          titulo,
          cuerpoHtml,
          iconosBase: this.frontendUrl(),
        }),
      })
      .catch((e: unknown) => {
        throw new BadRequestException(
          `No se pudo enviar el correo: ${e instanceof Error ? e.message : String(e)}`,
        );
      });

    const cambios: Partial<Convenio> = {
      token_hash: huella,
      enviado_a_contact_id: contacto.id,
      enviado_a_correo: correo,
      enviado_a_nombre: contacto.name,
      enviado_at: new Date().toISOString(),
      enviado_por: user.id ?? null,
      plantilla_id: plantilla.id,
    };
    if (vigente) {
      await this.repo.actualizar(companyId, vigente.id, cambios, 'enviado');
    } else {
      await this.repo.crear({
        ...cambios,
        company_id: companyId,
        client_id: clientId,
        estado: 'enviado',
        registrado_por: user.id ?? null,
      });
    }
    this.logger.info(`convenio enviado: cliente ${clientId} a ${correo}`);
    return { enviado_a: correo };
  }

  /** «Subir firmado»: el que se firmó en papel. */
  async firmadoEnPapel(clientId: string, dto: FirmadoEnPapelDto, user: User) {
    const companyId = user.company_id;
    await this.clienteDe(companyId, clientId);
    const plantilla = await this.repo.plantillaDe(companyId);
    if (!plantilla) {
      throw new BadRequestException('Tu empresa no tiene un convenio cargado.');
    }
    if (!dto.file_url.startsWith(this.carpetaDe(companyId, clientId))) {
      throw new BadRequestException('Ese archivo no es de este cliente.');
    }
    if (dto.fecha_firma > hoyEnChile()) {
      throw new BadRequestException(
        'La fecha de la firma no puede ser futura.',
      );
    }
    const vigente = await this.repo.vigente(companyId, clientId);
    if (vigente?.estado === 'firmado') {
      throw new ConflictException('Este cliente ya tiene el convenio firmado.');
    }
    const documento = await this.repo.agregarDocumento({
      company_id: companyId,
      client_id: clientId,
      file_name: dto.file_name,
      file_url: dto.file_url,
      categoria: 'convenio',
      subido_por: user.id ?? null,
      subido_por_nombre: user.full_name ?? null,
    });
    const firma: Partial<Convenio> = {
      estado: 'firmado',
      origen: 'papel',
      token_hash: null,
      firmado_at: `${dto.fecha_firma}T12:00:00-03:00`,
      vence_at: vencimiento(dto.fecha_firma, plantilla.vigencia_anios),
      firmante_nombre: dto.firmante?.trim() || null,
      documento_id: documento.id,
      plantilla_id: plantilla.id,
    };
    if (vigente) {
      await this.repo.actualizar(companyId, vigente.id, firma, 'enviado');
    } else {
      await this.repo.crear({
        ...firma,
        company_id: companyId,
        client_id: clientId,
        registrado_por: user.id ?? null,
      });
    }
    return { firmado: true };
  }

  /** «Generar PDF» cuando la firma quedó pero el PDF falló. */
  async regenerarPdf(clientId: string, user: User) {
    const c = await this.repo.vigente(user.company_id, clientId);
    if (!c || c.estado !== 'firmado' || c.origen !== 'en_linea') {
      throw new BadRequestException('No hay un convenio firmado en línea.');
    }
    if (c.documento_id) {
      const d = await this.repo.documento(user.company_id, c.documento_id);
      if (d) return { documento_id: d.id };
    }
    const guardado = await this.guardarPdf(c);
    if (!guardado) {
      throw new BadRequestException(
        'No se pudo generar el PDF. Inténtalo de nuevo en un rato.',
      );
    }
    return { documento_id: guardado.id };
  }

  // ------------------------------------------------------------------
  // Documentos del cliente
  // ------------------------------------------------------------------

  async documentos(clientId: string, user: User) {
    await this.clienteDe(user.company_id, clientId);
    return this.repo.documentos(user.company_id, clientId);
  }

  async agregarDocumento(
    clientId: string,
    dto: AgregarDocumentoDto,
    user: User,
  ) {
    await this.clienteDe(user.company_id, clientId);
    if (!dto.file_url.startsWith(this.carpetaDe(user.company_id, clientId))) {
      throw new BadRequestException('Ese archivo no es de este cliente.');
    }
    return this.repo.agregarDocumento({
      company_id: user.company_id,
      client_id: clientId,
      file_name: dto.file_name,
      file_url: dto.file_url,
      categoria: 'otros',
      subido_por: user.id ?? null,
      subido_por_nombre: user.full_name ?? null,
    });
  }

  async borrarDocumento(clientId: string, id: number, user: User) {
    const d = await this.repo.documento(user.company_id, id);
    if (!d || d.client_id !== clientId) {
      throw new NotFoundException('Documento no encontrado');
    }
    const c = await this.repo.vigente(user.company_id, clientId);
    if (c?.estado === 'firmado' && c.documento_id === d.id) {
      throw new BadRequestException(
        'Es el convenio firmado del cliente: no se borra desde aquí.',
      );
    }
    await this.repo.borrarDocumento(user.company_id, id);
    // El archivo se va después; si falla, queda solo en el balde.
    try {
      await this.storage.remove(d.file_url, user.company_id);
    } catch (e) {
      this.logger.error(`no se pudo borrar el archivo ${id}: ${String(e)}`);
    }
    return { borrado: true };
  }

  // ------------------------------------------------------------------
  // La página pública
  // ------------------------------------------------------------------

  private async porEnlace(token: string): Promise<Convenio> {
    if (!tieneFormaDeEnlace(token)) {
      throw new NotFoundException(ENLACE_NO_VALIDO);
    }
    const c = await this.repo.porHuella(sha256(token));
    if (!c || c.estado === 'anulado') {
      throw new NotFoundException(ENLACE_NO_VALIDO);
    }
    return c;
  }

  /** Lo que ve quien abre el enlace. Del cliente, solo la razón social. */
  async verPublico(token: string) {
    const c = await this.porEnlace(token);
    const marca = await this.marcaDe(c.company_id);
    const empresa = {
      nombre: marca.nombre,
      logo: marca.logo,
      color: marca.colorPrimario,
    };
    if (c.estado === 'firmado') {
      return {
        estado: 'firmado' as const,
        empresa,
        firmado_el: c.firmado_at ? fechaCorta(new Date(c.firmado_at)) : null,
      };
    }
    const plantilla = await this.repo.plantillaPorId(
      c.company_id,
      c.plantilla_id,
    );
    if (!plantilla) throw new NotFoundException(ENLACE_NO_VALIDO);
    const razonSocial = await this.razonSocialDe(c);
    return {
      estado: 'pendiente' as const,
      empresa,
      titulo: plantilla.titulo,
      beneficios: plantilla.beneficios,
      vigencia_anios: plantilla.vigencia_anios,
      razon_social: razonSocial,
      texto: textoParaLeer(plantilla.texto, {
        razon_social: razonSocial,
        fecha_firma: fechaLarga(new Date()),
        correo_de_contacto: plantilla.correo_de_contacto,
      }),
    };
  }

  private async razonSocialDe(c: Convenio): Promise<string> {
    const rs = await this.repo.razonSocialDe(c.company_id, c.client_id);
    if (rs) return rs;
    const cliente = await this.repo.clienteDe(c.company_id, c.client_id);
    return cliente?.name ?? '';
  }

  /** «Aceptar convenio». */
  async aceptar(
    token: string,
    dto: AceptarConvenioDto,
    ip: string | null,
    userAgent: string | null,
  ) {
    // doc 24 §8: sin la declaración de representación no se acepta (el
    // formulario ya lo exige; esto cubre a quien llame al motor directo).
    if (dto.declaro_representacion !== true) {
      throw new BadRequestException(
        'Para aceptar hay que declarar que tienes facultades para representar a la empresa',
      );
    }
    const c = await this.porEnlace(token);
    if (this.firmasEnCurso.has(c.id)) {
      throw new ConflictException(
        'Ya estamos registrando la aceptación: espera unos segundos.',
      );
    }
    this.firmasEnCurso.add(c.id);
    try {
      return await this.aceptarDeVerdad(c, dto, ip, userAgent);
    } finally {
      this.firmasEnCurso.delete(c.id);
    }
  }

  private yaFirmado(c: Convenio): never {
    throw new ConflictException(
      `Este convenio ya fue firmado${
        c.firmado_at ? ` el ${fechaCorta(new Date(c.firmado_at))}` : ''
      }.`,
    );
  }

  private async aceptarDeVerdad(
    c: Convenio,
    dto: AceptarConvenioDto,
    ip: string | null,
    userAgent: string | null,
  ) {
    if (c.estado === 'firmado') this.yaFirmado(c);
    const plantilla = await this.repo.plantillaPorId(
      c.company_id,
      c.plantilla_id,
    );
    if (!plantilla) throw new NotFoundException(ENLACE_NO_VALIDO);

    const ahora = new Date();
    const hoy = hoyEnChile(ahora);
    const datos: DatosDelConvenio = {
      razon_social: dto.razon_social.trim(),
      rut_empresa: formatearRut(dto.rut_empresa),
      representante_nombre: dto.representante_nombre.trim(),
      representante_rut: formatearRut(dto.representante_rut),
      representante_cargo: dto.representante_cargo.trim(),
      domicilio: dto.domicilio.trim(),
      comuna: dto.comuna.trim(),
      region: dto.region.trim(),
      correo_empresa: dto.correo.trim(),
      fecha_firma: fechaLarga(ahora),
      correo_de_contacto: plantilla.correo_de_contacto,
      personeria_documento: dto.personeria_documento,
      personeria_fecha: dto.personeria_fecha,
      personeria_notario: dto.personeria_notario,
    };
    const textoLleno = llenarPlantilla(plantilla.texto, datos);
    const vence = vencimiento(hoy, plantilla.vigencia_anios);

    // La firma se registra SOLO si el convenio sigue «enviado»: dos
    // pestañas que aceptan a la vez no firman dos veces.
    const firmado = await this.repo.actualizar(
      c.company_id,
      c.id,
      {
        estado: 'firmado',
        origen: 'en_linea',
        firmado_at: ahora.toISOString(),
        vence_at: vence,
        firmante_nombre: datos.representante_nombre ?? null,
        firmante_rut: normalizarRut(dto.representante_rut),
        firmante_cargo: datos.representante_cargo ?? null,
        firmante_correo: datos.correo_empresa ?? null,
        razon_social: datos.razon_social ?? null,
        rut_empresa: normalizarRut(dto.rut_empresa),
        domicilio: datos.domicilio ?? null,
        comuna: datos.comuna ?? null,
        region: datos.region ?? null,
        personeria_documento: dto.personeria_documento?.trim() || null,
        personeria_fecha: dto.personeria_fecha?.trim() || null,
        personeria_notario: dto.personeria_notario?.trim() || null,
        ip: ip?.slice(0, 100) ?? null,
        user_agent: userAgent?.slice(0, 500) ?? null,
        texto_firmado: textoLleno,
        texto_sha256: sha256(textoLleno),
        declara_representacion: dto.declaro_representacion === true,
      },
      'enviado',
    );
    if (!firmado) {
      const ahoraEs = await this.repo.porId(c.company_id, c.id);
      this.yaFirmado(ahoraEs ?? c);
    }
    this.logger.info(`convenio ${c.id} aceptado en línea`);

    // El PDF y los correos, después: la firma ya quedó. Si el PDF falla, la
    // ficha dice «PDF pendiente» y deja generarlo.
    const guardado = await this.guardarPdf(firmado, plantilla);
    await this.avisar(firmado, plantilla, guardado?.pdf ?? null);
    return {
      firmado: true,
      firmado_el: fechaCorta(ahora),
      vence_el: fechaCorta(vence),
    };
  }

  /** Imprime el PDF del convenio firmado en línea y lo deja en los
   *  documentos del cliente. Devuelve el documento y el PDF, o null. */
  private async guardarPdf(
    c: Convenio,
    plantilla?: PlantillaDeConvenio | null,
  ): Promise<{ id: number; pdf: Buffer } | null> {
    try {
      if (!c.texto_firmado || !c.firmado_at) return null;
      const p =
        plantilla ??
        (await this.repo.plantillaPorId(c.company_id, c.plantilla_id));
      const pdf = await this.armarPdf(c);
      const nombre = `Convenio_${(c.razon_social || 'cliente').replace(
        /[^\p{L}\p{N}]+/gu,
        '_',
      )}_${fechaCorta(new Date(c.firmado_at))}.pdf`;
      const { url } = await this.storage.guardarDelMotor(
        c.company_id,
        'client-documents',
        c.client_id,
        nombre,
        pdf,
        'application/pdf',
      );
      const documento = await this.repo.agregarDocumento({
        company_id: c.company_id,
        client_id: c.client_id,
        file_name: `${p?.nombre ?? 'Convenio'} firmado · ${fechaCorta(
          new Date(c.firmado_at),
        )}.pdf`,
        file_url: url,
        categoria: 'convenio',
        subido_por: null,
        subido_por_nombre: 'Aceptado en línea',
      });
      await this.repo.actualizar(c.company_id, c.id, {
        documento_id: documento.id,
      });
      c.documento_id = documento.id;
      return { id: documento.id, pdf };
    } catch (e) {
      this.logger.error(`PDF del convenio ${c.id} falló: ${String(e)}`);
      return null;
    }
  }

  private async armarPdf(c: Convenio): Promise<Buffer> {
    const marca = await this.marcaDe(c.company_id);
    const html = hojaDelConvenio({
      textoLleno: c.texto_firmado as string,
      colorPrimario: marca.colorPrimario,
      constancia: {
        firmante_nombre: c.firmante_nombre ?? '',
        firmante_rut: formatearRut(c.firmante_rut ?? ''),
        firmante_cargo: c.firmante_cargo ?? '',
        firmante_correo: c.firmante_correo ?? '',
        razon_social: c.razon_social ?? '',
        rut_empresa: formatearRut(c.rut_empresa ?? ''),
        firmado_at: new Date(c.firmado_at as string),
        ip: c.ip,
        user_agent: c.user_agent,
        texto_sha256: c.texto_sha256 ?? sha256(c.texto_firmado as string),
        empresa: marca.nombre,
        vence: c.vence_at as string,
        declara_representacion: c.declara_representacion === true,
      },
    });
    return this.impresora.imprimir(html);
  }

  /** La copia al firmante (con el PDF) y el aviso a la empresa. Lo que
   *  falle aquí queda en el registro: la firma ya está guardada. */
  private async avisar(
    c: Convenio,
    plantilla: PlantillaDeConvenio,
    pdf: Buffer | null,
  ) {
    const marca = await this.marcaDe(c.company_id);
    const fecha = fechaCorta(new Date(c.firmado_at as string));
    const vence = fechaCorta(c.vence_at as string);
    const adjunto = pdf
      ? {
          filename: `Convenio_${(c.razon_social || 'cliente').replace(
            /[^\p{L}\p{N}]+/gu,
            '_',
          )}_${fecha}.pdf`,
          content: pdf.toString('base64'),
        }
      : null;
    const marco = (titulo: string, cuerpoHtml: string) =>
      plantillaCampana({
        marca,
        titulo,
        cuerpoHtml,
        iconosBase: this.frontendUrl(),
      });

    if (c.firmante_correo) {
      const copia = correoDeCopia({
        empresa: marca.nombre,
        razonSocial: c.razon_social ?? '',
        nombre: c.firmante_nombre ?? '',
        titulo: plantilla.titulo,
        fecha,
        vence,
      });
      try {
        await this.correos.enviar({
          de: `${marca.nombre} <hola@eventi-app.com>`,
          para: [c.firmante_correo],
          responderA: marca.replyTo,
          asunto: copia.asunto,
          html: marco(copia.titulo, copia.cuerpoHtml),
          adjuntos: adjunto ? [adjunto] : [],
        });
      } catch (e) {
        this.logger.error(`copia al firmante falló: ${String(e)}`);
      }
    }

    if (marca.replyTo) {
      const cliente = await this.repo.clienteDe(c.company_id, c.client_id);
      const aviso = correoDeAviso({
        titulo: plantilla.titulo,
        razonSocial: c.razon_social ?? '',
        cliente: cliente?.name ?? '',
        nombre: c.firmante_nombre ?? '',
        cargo: c.firmante_cargo ?? '',
        correo: c.firmante_correo ?? '',
        fecha,
        vence,
        enlaceFicha: `${this.frontendUrl()}/clients/${c.client_id}`,
        color: marca.colorPrimario,
        conPdf: !!pdf,
      });
      try {
        await this.correos.enviar({
          de: `Eventia <hola@eventi-app.com>`,
          para: [marca.replyTo],
          asunto: aviso.asunto,
          html: marco(aviso.titulo, aviso.cuerpoHtml),
          adjuntos: adjunto ? [adjunto] : [],
        });
      } catch (e) {
        this.logger.error(`aviso interno del convenio falló: ${String(e)}`);
      }
    } else {
      this.logger.warn(
        `empresa ${c.company_id} sin «Responder a»: no hay a quién avisar del convenio`,
      );
    }
  }
}
