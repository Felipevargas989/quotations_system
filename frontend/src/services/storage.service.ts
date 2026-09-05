// MISIÓN STORAGE (28-07): los archivos también pasan por UNA SOLA
// PUERTA. Este servicio ya no toca Supabase Storage: manda el archivo
// al backend, que valida, arma la ruta con la empresa de la sesión y
// guarda con su propia llave. Para VER un comprobante (balde privado)
// se pide un enlace firmado que caduca en minutos: resolveStorageUrl().
// Las firmas públicas de este archivo son las mismas de siempre.
import { api, apiRequest } from "./api";

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

const subir = async (
  file: File,
  campos: Record<string, string>,
): Promise<UploadResult> => {
  try {
    const check = validateImageFile(file);
    if (!check.valid) throw new Error(check.error);
    const form = new FormData();
    form.append("file", file);
    Object.entries(campos).forEach(([k, v]) => form.append(k, v));
    const { data } = await api.request({
      url: "/storage/upload",
      method: "POST",
      data: form,
      headers: { "Content-Type": undefined },
    });
    return { success: true, url: (data as { url: string }).url };
  } catch (error) {
    const mensaje =
      (error as { response?: { data?: { message?: string } } })?.response?.data
        ?.message ||
      (error instanceof Error ? error.message : "Error al subir el archivo");
    return { success: false, error: String(mensaje) };
  }
};

export const uploadPaymentReceipt = async (
  file: File,
  quotationId: string,
  paymentId: string,
  transactionId?: number,
): Promise<UploadResult> =>
  subir(file, {
    kind: "payment-receipt",
    quotation_id: quotationId,
    payment_id: paymentId,
    ...(transactionId ? { transaction_id: String(transactionId) } : {}),
  });

// Comprobante de un reembolso (misma bucket, prefijo distinto).
export const uploadRefundReceipt = async (
  file: File,
  quotationId: string,
  refundId: string | number,
): Promise<UploadResult> =>
  subir(file, {
    kind: "refund-receipt",
    quotation_id: quotationId,
    refund_id: String(refundId),
  });

// Documento del evento por categoría.
export const uploadEventDocument = async (
  file: File,
  quotationId: string,
  category: string,
): Promise<UploadResult> =>
  subir(file, {
    kind: "event-document",
    quotation_id: quotationId,
    category,
  });

export const uploadCompanyLogo = async (
  _companyId: string,
  file: File,
): Promise<UploadResult> => subir(file, { kind: "company-logo" });

// Banner de los correos de marketing (migración 96): imagen ancha que
// reemplaza el encabezado del correo cuando existe.
export const uploadCompanyBanner = async (
  _companyId: string,
  file: File,
): Promise<UploadResult> => subir(file, { kind: "company-banner" });

// Banner PROPIO de una campaña (28-08): nombre único por subida.
export const uploadCampaignBanner = async (
  file: File,
): Promise<UploadResult> => subir(file, { kind: "campaign-banner" });

// Foto de referencia de un ítem de inventario (mobiliario). Bucket público
// furniture-photos; se muestra en un popup, nunca como descarga.
export const uploadFurniturePhoto = async (
  file: File,
  _companyId: number,
  itemId: number,
): Promise<UploadResult> =>
  subir(file, { kind: "furniture-photo", item_id: String(itemId) });

// ¿Este valor guardado apunta al balde PRIVADO de comprobantes?
// (ruta nueva c<empresa>/..., prefijo viejo, o URL pública vieja)
const esArchivoPrivado = (src: string): boolean => {
  if (!src) return false;
  if (src.includes("/object/public/payment-receipts/")) return true;
  if (src.startsWith("http") || src.startsWith("blob:")) return false;
  return /^(c\d+|payment-receipts|refund-receipts|event-documents)\//.test(src);
};

// Cambia lo guardado en la base (ruta o URL vieja) por un enlace firmado
// de pocos minutos. Lo que NO es del balde privado se devuelve tal cual
// (logos, fotos de mobiliario, blobs locales).
export const resolveStorageUrl = async (src: string): Promise<string> => {
  if (!esArchivoPrivado(src)) return src;
  const data = (await apiRequest("/storage/signed-url", "GET", undefined, {
    src,
  })) as { url: string };
  return data.url;
};

// Elimina un archivo del balde privado a partir de lo guardado en la base.
export const deleteStorageFileByUrl = async (
  url: string,
): Promise<boolean> => {
  try {
    const data = (await apiRequest("/storage/delete", "POST", {
      src: url,
    })) as { deleted: boolean };
    return !!data.deleted;
  } catch {
    return false;
  }
};

export const deletePaymentReceipt = async (url: string): Promise<boolean> =>
  deleteStorageFileByUrl(url);

/** El brochure del embudo de consultas (05-09, doc 12): el PDF que se
 *  adjunta al correo automático. Balde privado; devuelve la RUTA. */
export const uploadConsultaBrochure = (file: File, eventType: string) =>
  subir(file, { kind: "consulta-brochure", category: eventType });

export const validateImageFile = (
  file: File,
): { valid: boolean; error?: string } => {
  // Check file type
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error:
        "Tipo de archivo no válido. Solo se permiten imágenes (JPG, PNG, WebP) y PDF",
    };
  }

  // Check file size (5MB max)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: "El archivo es demasiado grande. Máximo 5MB",
    };
  }

  return { valid: true };
};
