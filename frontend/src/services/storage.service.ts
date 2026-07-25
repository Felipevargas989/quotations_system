import { supabase } from "../lib/supabase";

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

export const uploadPaymentReceipt = async (
  file: File,
  quotationId: string,
  paymentId: string,
  transactionId?: number,
): Promise<UploadResult> => {
  try {
    // Validate file
    if (!file) {
      throw new Error("No file provided");
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (!allowedTypes.includes(file.type)) {
      throw new Error(
        "Tipo de archivo no válido. Solo se permiten imágenes (JPG, PNG, WebP) y PDF",
      );
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new Error("El archivo es demasiado grande. Máximo 5MB");
    }

    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileExtension = file.name.split(".").pop();
    const filename = transactionId
      ? `${transactionId}_${timestamp}.${fileExtension}`
      : `receipt_${timestamp}.${fileExtension}`;

    // Create file path
    const filePath = `payment-receipts/${quotationId}/${paymentId}/${filename}`;

    // Upload file to Supabase Storage
    const { error } = await supabase.storage
      .from("payment-receipts")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Storage upload error:", error);
      throw new Error(`Error al subir el archivo: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("payment-receipts")
      .getPublicUrl(filePath);

    return {
      success: true,
      url: urlData.publicUrl,
    };
  } catch (error) {
    console.error("Upload error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al subir el archivo",
    };
  }
};

const BUCKET = "payment-receipts";

const sanitize = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");

const uploadToBucket = async (
  file: File,
  filePath: string,
): Promise<UploadResult> => {
  try {
    const check = validateImageFile(file);
    if (!check.valid) throw new Error(check.error);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, { cacheControl: "3600", upsert: false });
    if (error) throw new Error(`Error al subir el archivo: ${error.message}`);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    return { success: true, url: data.publicUrl };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al subir",
    };
  }
};

// Comprobante de un reembolso (misma bucket, prefijo distinto).
export const uploadRefundReceipt = async (
  file: File,
  quotationId: string,
  refundId: string | number,
): Promise<UploadResult> => {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = file.name.split(".").pop();
  const path = `refund-receipts/${quotationId}/${refundId}_${ts}.${ext}`;
  return uploadToBucket(file, path);
};

// Documento del evento por categoría.
export const uploadEventDocument = async (
  file: File,
  quotationId: string,
  category: string,
): Promise<UploadResult> => {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `event-documents/${quotationId}/${category}/${ts}_${sanitize(
    file.name,
  )}`;
  return uploadToBucket(file, path);
};

// Elimina un archivo del bucket a partir de su URL pública.
export const deleteStorageFileByUrl = async (url: string): Promise<boolean> => {
  try {
    const marker = `/public/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return false;
    const path = decodeURIComponent(url.slice(idx + marker.length));
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    return !error;
  } catch {
    return false;
  }
};

export const deletePaymentReceipt = async (url: string): Promise<boolean> => {
  try {
    // Extract file path from URL
    const urlParts = url.split("/");
    const filePath = urlParts.slice(-4).join("/"); // Get last 4 parts: payment-receipts/quotationId/paymentId/filename

    const { error } = await supabase.storage
      .from("payment-receipts")
      .remove([filePath]);

    if (error) {
      console.error("Delete error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Delete error:", error);
    return false;
  }
};

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

export const uploadCompanyLogo = async (
  companyId: string,
  file: File,
): Promise<UploadResult> => {
  try {
    const filename = `${companyId}_logo.${file.name.split(".").pop()}`;

    const { error } = await supabase.storage
      .from("company-logos")
      .upload(filename, file, {
        cacheControl: "3600",
        upsert: true, // Allow overwriting existing logo
      });

    if (error) {
      throw new Error(`Error al subir el archivo: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("company-logos")
      .getPublicUrl(filename);

    return {
      success: true,
      url: urlData.publicUrl,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al subir el archivo",
    };
  }
};
