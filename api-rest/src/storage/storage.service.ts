import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { UploadFileDto } from './dto/upload-file.dto';

// ---------------- MISIÓN STORAGE: "una sola puerta" para archivos ----
// Antes el navegador escribía DIRECTO en el balde (y el balde de
// comprobantes era público: cualquiera con el enlace veía un comprobante
// bancario). Ahora:
//  - Subir: el backend valida tipo/tamaño, arma la ruta él mismo con la
//    empresa de la sesión (c<empresa>/...) y guarda con su propia llave.
//  - Ver (balde privado): el backend verifica que el archivo sea de tu
//    empresa y entrega un enlace firmado que caduca en minutos.
//  - Los archivos viejos (rutas sin empresa) se verifican buscando la
//    cotización de su ruta y comparando la empresa.
// Fotos de mobiliario y logos quedan en baldes de lectura pública (no
// son sensibles) pero también se SUBEN por aquí.

const BUCKET_PRIVADO = 'payment-receipts';
const MAX_BYTES = 5 * 1024 * 1024;
const MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
// Segundos de vida de un enlace firmado. Corto a propósito: el visor
// pide uno nuevo cada vez que se abre.
const VIGENCIA_FIRMA = 300;

const sanitize = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');

const soloId = (v: string | undefined, campo: string): string => {
  if (!v || !/^[a-zA-Z0-9_-]+$/.test(v)) {
    throw new BadRequestException(`Falta o es inválido: ${campo}`);
  }
  return v;
};

@Injectable()
export class StorageService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StorageService.name);
  }

  private stamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  async upload(
    dto: UploadFileDto,
    file: Express.Multer.File,
    companyId: number,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('No llegó ningún archivo');
    if (!MIMES.has(file.mimetype)) {
      throw new BadRequestException(
        'Tipo de archivo no válido. Solo imágenes (JPG, PNG, WebP) y PDF',
      );
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(
        'El archivo es demasiado grande. Máximo 5MB',
      );
    }

    const ext = sanitize(file.originalname.split('.').pop() || 'bin');
    const ts = this.stamp();
    let bucket = BUCKET_PRIVADO;
    let path: string;
    let upsert = false;
    let publica = false;

    switch (dto.kind) {
      case 'portal-receipt': {
        const q = soloId(dto.quotation_id, 'quotation_id');
        path = `c${companyId}/portal-receipts/${q}/${ts}_${sanitize(
          file.originalname,
        )}`;
        break;
      }
      case 'payment-receipt': {
        const q = soloId(dto.quotation_id, 'quotation_id');
        const p = soloId(dto.payment_id, 'payment_id');
        const nombre = dto.transaction_id
          ? `${soloId(dto.transaction_id, 'transaction_id')}_${ts}.${ext}`
          : `receipt_${ts}.${ext}`;
        path = `c${companyId}/payment-receipts/${q}/${p}/${nombre}`;
        break;
      }
      case 'refund-receipt': {
        const q = soloId(dto.quotation_id, 'quotation_id');
        const r = soloId(dto.refund_id, 'refund_id');
        path = `c${companyId}/refund-receipts/${q}/${r}_${ts}.${ext}`;
        break;
      }
      case 'event-document': {
        const q = soloId(dto.quotation_id, 'quotation_id');
        const cat = sanitize(dto.category || 'general');
        path = `c${companyId}/event-documents/${q}/${cat}/${ts}_${sanitize(
          file.originalname,
        )}`;
        break;
      }
      case 'furniture-photo': {
        const item = soloId(dto.item_id, 'item_id');
        bucket = 'furniture-photos';
        publica = true;
        path = `${companyId}/${item}_${ts}.${ext}`;
        break;
      }
      case 'company-logo': {
        bucket = 'company-logos';
        publica = true;
        upsert = true;
        path = `${companyId}_logo.${ext}`;
        break;
      }
      // El banner de los correos de marketing (Felipe, 26-08): imagen
      // ancha que reemplaza el encabezado; vive junto al logo.
      case 'company-banner': {
        bucket = 'company-logos';
        publica = true;
        upsert = true;
        path = `${companyId}_banner.${ext}`;
        break;
      }
      default:
        throw new BadRequestException('Tipo de subida desconocido');
    }

    this.logger.info(
      `upload ${dto.kind} -> ${bucket}/${path} (${file.size} bytes)`,
    );
    const { error } = await this.supabase.client.storage
      .from(bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert,
      });
    if (error) {
      throw new BadRequestException(
        `Error al subir el archivo: ${error.message}`,
      );
    }

    if (publica) {
      const { data } = this.supabase.client.storage
        .from(bucket)
        .getPublicUrl(path);
      return { url: data.publicUrl };
    }
    // Balde privado: se guarda la RUTA; el visor pide el enlace firmado.
    return { url: path };
  }

  // Acepta la ruta nueva (c<empresa>/...) o una URL pública vieja, y
  // devuelve la ruta dentro del balde privado.
  private extraerRuta(src: string): string {
    const marca = `/object/public/${BUCKET_PRIVADO}/`;
    const idx = src.indexOf(marca);
    if (idx !== -1) {
      return decodeURIComponent(src.slice(idx + marca.length)).split('?')[0];
    }
    if (src.startsWith('http')) {
      throw new BadRequestException(
        'URL desconocida: no es del balde de comprobantes',
      );
    }
    return src.split('?')[0];
  }

  // Regla de dueño: rutas nuevas llevan la empresa en el primer tramo
  // (c<empresa>/...); las viejas empiezan con el prefijo del tipo y
  // llevan la cotización en el segundo tramo — se busca su empresa.
  private async verificarDueno(path: string, companyId: number): Promise<void> {
    const partes = path.split('/');
    if (/^c\d+$/.test(partes[0])) {
      if (partes[0] !== `c${companyId}`) {
        throw new ForbiddenException('Ese archivo no es de tu empresa');
      }
      return;
    }
    const prefijosViejos = new Set([
      'payment-receipts',
      'refund-receipts',
      'event-documents',
    ]);
    if (!prefijosViejos.has(partes[0]) || partes.length < 2) {
      throw new ForbiddenException('Ruta de archivo desconocida');
    }
    const quotationId = partes[1];
    const { data } = await this.supabase.client
      .from('quotations')
      .select('company_id')
      .eq('id', quotationId)
      .single();
    const fila = data as { company_id: number } | null;
    if (!fila || fila.company_id !== companyId) {
      throw new ForbiddenException('Ese archivo no es de tu empresa');
    }
  }

  async signedUrl(src: string, companyId: number): Promise<{ url: string }> {
    const path = this.extraerRuta(src);
    await this.verificarDueno(path, companyId);
    const { data, error } = await this.supabase.client.storage
      .from(BUCKET_PRIVADO)
      .createSignedUrl(path, VIGENCIA_FIRMA);
    if (error || !data?.signedUrl) {
      throw new BadRequestException(
        `No se pudo firmar el enlace: ${error?.message ?? 'sin detalle'}`,
      );
    }
    return { url: data.signedUrl };
  }

  async remove(src: string, companyId: number): Promise<{ deleted: boolean }> {
    const path = this.extraerRuta(src);
    await this.verificarDueno(path, companyId);
    this.logger.info(`remove ${BUCKET_PRIVADO}/${path}`);
    const { error } = await this.supabase.client.storage
      .from(BUCKET_PRIVADO)
      .remove([path]);
    return { deleted: !error };
  }
}
