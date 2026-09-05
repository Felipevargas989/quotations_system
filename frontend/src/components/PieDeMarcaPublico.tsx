import { Facebook, Globe, Instagram } from "lucide-react";
import IconoWhatsApp from "./IconoWhatsApp";
import type { Company } from "../types/companies.types";

/**
 * EL PIE CON LA MARCA de las páginas públicas (Felipe, 05-09): nombre,
 * tagline y redes — el mismo lenguaje del pie de los correos. Nació en
 * el formulario público de cotización (la higuera lo trajo acá al
 * cruzar el formulario las 800 líneas); cualquier página pública nueva
 * lo reusa en vez de clonarlo.
 */
export default function PieDeMarcaPublico({
  company,
  colorPrimario,
}: {
  readonly company: Pick<
    Company,
    "name" | "tagline" | "whatsapp" | "instagram" | "facebook" | "sitio_web"
  > | null;
  readonly colorPrimario: string;
}) {
  return (
    <div className="px-6 sm:px-10 py-6 bg-gray-50 border-t border-gray-200 text-center">
      <p className="text-sm font-bold" style={{ color: colorPrimario }}>
        {company?.name || "Empresa"}
      </p>
      {company?.tagline && (
        <p className="text-xs text-gray-500 mt-0.5">{company.tagline}</p>
      )}
      <div className="flex items-center justify-center gap-4 mt-3">
        {company?.whatsapp && (
          <a
            href={`https://wa.me/${company.whatsapp.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            title="WhatsApp"
            className="text-gray-400 hover:text-emerald-600"
          >
            <IconoWhatsApp size={20} />
          </a>
        )}
        {company?.instagram && (
          <a
            href={company.instagram}
            target="_blank"
            rel="noreferrer"
            title="Instagram"
            className="text-gray-400 hover:text-pink-600"
          >
            <Instagram className="w-5 h-5" />
          </a>
        )}
        {company?.facebook && (
          <a
            href={company.facebook}
            target="_blank"
            rel="noreferrer"
            title="Facebook"
            className="text-gray-400 hover:text-blue-600"
          >
            <Facebook className="w-5 h-5" />
          </a>
        )}
        {company?.sitio_web && (
          <a
            href={company.sitio_web}
            title="Sitio web"
            className="text-gray-400 hover:text-gray-700"
          >
            <Globe className="w-5 h-5" />
          </a>
        )}
      </div>
    </div>
  );
}
