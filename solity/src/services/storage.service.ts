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
    const { data, error } = await supabase.storage
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
