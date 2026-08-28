import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import { uploadCampaignBanner } from "../../services/storage.service";

/**
 * MARCA PROPIA DE LA CAMPAÑA (Felipe 28-08): banner y WhatsApp
 * opcionales por campaña — vacíos, manda la marca de Configuración.
 * Una sola pieza para el creador y el editor de borradores.
 */
export default function CampanaMarcaPropia({
  bannerUrl,
  whatsapp,
  onBanner,
  onWhatsapp,
}: {
  readonly bannerUrl: string;
  readonly whatsapp: string;
  readonly onBanner: (url: string) => void;
  readonly onWhatsapp: (v: string) => void;
}) {
  const refArchivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const elegir = async (input: HTMLInputElement) => {
    const archivo = input.files?.[0];
    input.value = "";
    if (!archivo) return;
    // Mismas reglas que el banner de Configuración.
    const tipos = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!tipos.includes(archivo.type)) {
      toast.error("Solo imágenes JPG, PNG o WebP");
      return;
    }
    if (archivo.size > 5 * 1024 * 1024) {
      toast.error("La imagen pesa más de 5MB");
      return;
    }
    setSubiendo(true);
    try {
      const r = await uploadCampaignBanner(archivo);
      if (!r.success || !r.url) {
        toast.error(r.error || "No se pudo subir el banner");
        return;
      }
      onBanner(r.url);
      toast.success("Banner de la campaña subido");
    } catch {
      toast.error("No se pudo subir el banner");
    } finally {
      setSubiendo(false);
    }
  };
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-sm font-medium text-gray-700 mb-0.5">
        Marca propia de esta campaña{" "}
        <span className="font-normal text-gray-500">(opcional)</span>
      </p>
      <p className="text-[11px] text-gray-400 mb-2">
        Lo que dejes vacío usa la marca de Configuración, como siempre.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <input
            ref={refArchivo}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void elegir(e.target)}
          />
          {bannerUrl ? (
            <div className="flex items-center gap-2">
              <img
                src={bannerUrl}
                alt="Banner de la campaña"
                className="h-10 rounded border border-gray-200 object-cover flex-1 min-w-0"
              />
              <button
                type="button"
                onClick={() => onBanner("")}
                title="Quitar y volver al banner de la marca"
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => refArchivo.current?.click()}
              disabled={subiendo}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {subiendo ? "Subiendo…" : "Banner propio…"}
            </button>
          )}
        </div>
        <input
          value={whatsapp}
          onChange={(e) => onWhatsapp(e.target.value)}
          placeholder="WhatsApp propio (ej: +56 9 1234 5678)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        />
      </div>
    </div>
  );
}
