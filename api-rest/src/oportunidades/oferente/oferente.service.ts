import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { sanitize } from 'src/storage/storage.service';
import { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import {
  extensionDe,
  nombreLimpio,
  sello,
  TIPOS_POR_EXTENSION,
} from '../adjuntos/adjuntos.service';
import {
  type DocumentoDeEmpresa,
  type Oferente,
  OferenteRepository,
} from './oferente.repository';

// LA EMPRESA COMO OFERENTE (doc 17, sprint 3, paso 2; §5.5; migración 126).
// Felipe, 17-10: "el rellenado de documentos debe tener primero una forma
// de meter la información de la empresa, la firma (una foto de la firma)".
//
// Los datos con que la empresa se presenta (razón social, RUT, domicilio,
// representante legal), lo que la IA usa para escribir (experiencia,
// instalaciones), la foto de la firma y la carpeta de documentos con su
// vencimiento. El nombre y los datos bancarios se leen de Configuración de
// empresa: aquí solo se muestran. Los archivos van al balde privado, en
// c<empresa>/oferente/, por la misma puerta que el resto (misión storage).

export const TIPOS_DE_DOCUMENTO = [
  'patente',
  'inicio_actividades',
  'programa_integridad',
  'f30',
  'vigencia',
  'resolucion_sanitaria',
  'dj_trabajadores',
  'otro',
] as const;

/** La firma: una imagen chica, idealmente con fondo blanco o
 *  transparente. */
const TIPOS_DE_FIRMA: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
export const MAX_BYTES_FIRMA = 2 * 1024 * 1024;

/** Los documentos de la carpeta: PDF, imágenes y Word. */
const EXTENSIONES_DE_DOCUMENTO = new Set([
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'doc',
  'docx',
]);
export const MAX_BYTES_DOCUMENTO = 15 * 1024 * 1024;

const RUT = /^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/;

const CAMPOS: ReadonlyArray<keyof Oferente> = [
  'razon_social',
  'rut',
  'giro',
  'direccion',
  'comuna',
  'region',
  'telefono',
  'correo',
  'representante_nombre',
  'representante_rut',
  'representante_cargo',
  'experiencia',
  'instalaciones',
];

const OFERENTE_VACIO: Oferente = {
  razon_social: null,
  rut: null,
  giro: null,
  direccion: null,
  comuna: null,
  region: null,
  telefono: null,
  correo: null,
  representante_nombre: null,
  representante_rut: null,
  representante_cargo: null,
  experiencia: null,
  instalaciones: null,
  firma_ruta: null,
  firma_subida_en: null,
};

export type VistaDelOferente = {
  oferente: Oferente;
  /** De Configuración de empresa, solo a la vista. */
  empresa: {
    nombre: string | null;
    banco: {
      rut: string | null;
      banco: string | null;
      tipo_cuenta: string | null;
      numero: string | null;
      titular: string | null;
    } | null;
  };
  documentos: DocumentoDeEmpresa[];
};

@Injectable()
export class OferenteService {
  constructor(
    private readonly repo: OferenteRepository,
    private readonly archivos: AdjuntosRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OferenteService.name);
  }

  async ver(companyId: number): Promise<VistaDelOferente> {
    const [oferente, empresa, documentos] = await Promise.all([
      this.repo.oferente(companyId),
      this.repo.empresa(companyId),
      this.repo.documentos(companyId),
    ]);
    const b = empresa?.bank_details;
    return {
      oferente: { ...OFERENTE_VACIO, ...(oferente ?? {}) },
      empresa: {
        nombre: empresa?.name ?? null,
        banco: b
          ? {
              rut: b.rut ?? null,
              banco: b.banco ?? null,
              tipo_cuenta: b.tipo_cuenta ?? null,
              numero: b.numero ?? null,
              titular: b.titular ?? null,
            }
          : null,
      },
      documentos,
    };
  }

  /** Guarda lo que viene: sin espacios de más, y vacío = sin dato. Los RUT
   *  tienen que tener forma de RUT. */
  async guardar(
    companyId: number,
    dto: Partial<Record<keyof Oferente, string>>,
  ): Promise<VistaDelOferente> {
    const cambios: Partial<Oferente> = {};
    for (const campo of CAMPOS) {
      const valor = dto[campo];
      if (valor === undefined) continue;
      const limpio = valor.replace(/[ \t]+/g, ' ').trim();
      (cambios as Record<string, string | null>)[campo] = limpio || null;
    }
    if (Object.keys(cambios).length === 0) {
      throw new BadRequestException('No hay nada que guardar.');
    }
    for (const campo of ['rut', 'representante_rut'] as const) {
      const rut = cambios[campo];
      if (rut && !RUT.test(rut)) {
        throw new BadRequestException(
          `"${rut}" no tiene forma de RUT (12.345.678-9).`,
        );
      }
    }
    await this.repo.guardar(companyId, cambios);
    return this.ver(companyId);
  }

  /** La foto de la firma: reemplaza la anterior (y la borra del balde). */
  async subirFirma(
    companyId: number,
    archivo: Express.Multer.File | undefined,
  ): Promise<VistaDelOferente> {
    if (!archivo) throw new BadRequestException('No llegó ninguna imagen.');
    const ext = extensionDe(nombreLimpio(archivo.originalname));
    const tipo = TIPOS_DE_FIRMA[ext];
    if (!tipo) {
      throw new BadRequestException(
        'La firma va como imagen: PNG, JPG o WebP.',
      );
    }
    if (archivo.size <= 0 || archivo.size > MAX_BYTES_FIRMA) {
      throw new BadRequestException('La imagen de la firma pesa más de 2 MB.');
    }
    const anterior = (await this.repo.oferente(companyId))?.firma_ruta ?? null;
    const ruta = `c${companyId}/oferente/firma_${sello()}.${ext}`;
    await this.archivos.subirArchivo(ruta, archivo.buffer, tipo);
    try {
      await this.repo.guardar(companyId, {
        firma_ruta: ruta,
        firma_subida_en: new Date().toISOString(),
      });
    } catch (error) {
      await this.archivos.borrarArchivo(ruta);
      throw error;
    }
    if (anterior) await this.borrarSinRomper(anterior);
    return this.ver(companyId);
  }

  async borrarFirma(companyId: number): Promise<VistaDelOferente> {
    const anterior = (await this.repo.oferente(companyId))?.firma_ruta ?? null;
    if (!anterior) throw new NotFoundException('No hay firma guardada.');
    await this.repo.guardar(companyId, {
      firma_ruta: null,
      firma_subida_en: null,
    });
    await this.borrarSinRomper(anterior);
    return this.ver(companyId);
  }

  async subirDocumento(
    companyId: number,
    cuentaId: string,
    archivo: Express.Multer.File | undefined,
    dto: { tipo: string; vence?: string },
  ): Promise<DocumentoDeEmpresa> {
    if (!archivo) throw new BadRequestException('No llegó ningún archivo.');
    const nombre = nombreLimpio(archivo.originalname);
    const ext = extensionDe(nombre);
    if (!EXTENSIONES_DE_DOCUMENTO.has(ext)) {
      throw new BadRequestException(
        `"${nombre}" no se puede subir: sirven PDF, Word e imágenes.`,
      );
    }
    if (archivo.size <= 0) {
      throw new BadRequestException(`"${nombre}" está vacío.`);
    }
    if (archivo.size > MAX_BYTES_DOCUMENTO) {
      throw new BadRequestException(`"${nombre}" pesa más de 15 MB.`);
    }
    const ruta = `c${companyId}/oferente/documentos/${sello()}_${sanitize(nombre)}`;
    const tipoArchivo = TIPOS_POR_EXTENSION[ext];
    await this.archivos.subirArchivo(ruta, archivo.buffer, tipoArchivo);
    try {
      return await this.repo.guardarDocumento({
        company_id: companyId,
        tipo: dto.tipo,
        nombre,
        ruta,
        tipo_archivo: tipoArchivo,
        bytes: archivo.size,
        vence: dto.vence?.trim() || null,
        subido_por: await this.archivos.perfilDe(companyId, cuentaId),
      });
    } catch (error) {
      await this.archivos.borrarArchivo(ruta);
      throw error;
    }
  }

  async borrarDocumento(
    companyId: number,
    id: number,
  ): Promise<{ borrado: true }> {
    const fila = await this.repo.borrarDocumento(companyId, id);
    if (!fila) throw new NotFoundException('No encontramos ese documento.');
    await this.borrarSinRomper(fila.ruta);
    return { borrado: true };
  }

  /** Si el balde falla, queda un archivo que nadie ve (inofensivo) y se
   *  anota; lo que pidió la persona igual queda hecho. */
  private async borrarSinRomper(ruta: string): Promise<void> {
    try {
      if (!(await this.archivos.borrarArchivo(ruta))) {
        this.logger.warn(`no se pudo borrar del balde: ${ruta}`);
      }
    } catch (error) {
      this.logger.warn(
        `no se pudo borrar del balde: ${ruta} (${mensajeDe(error)})`,
      );
    }
  }
}
