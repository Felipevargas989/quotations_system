import type { Company } from "../types/companies.types";
import { urlAbsoluta } from "../utils/urls";

/**
 * EL PIE CON LA MARCA de las páginas públicas — EL MISMO del correo
 * (Felipe, 05-09: "el footer no es el mismo del correo"): la franja
 * del color secundario, el nombre en el primario, el tagline y los
 * íconos clásicos de imagen (public/correo/*.png) que usan las
 * campañas. Si cambia el pie de los correos, cambiar este igual.
 */

/** Gemela de esClaro en api-rest/src/marketing/plantilla.ts: la
 *  franja usa el secundario solo si es claro; un acento saturado va
 *  sobre neutro. */
const esClaro = (hex: string): boolean => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 200;
};

export default function PieDeMarcaPublico({
  company,
  colorPrimario,
  colorSecundario,
}: {
  readonly company: Pick<
    Company,
    "name" | "tagline" | "instagram" | "facebook" | "sitio_web"
  > | null;
  readonly colorPrimario: string;
  readonly colorSecundario?: string | null;
}) {
  const fondoFranja =
    colorSecundario && esClaro(colorSecundario) ? colorSecundario : "#f9fafb";
  const icono = (url: string, archivo: string, alt: string) => (
    <a href={urlAbsoluta(url)} target="_blank" rel="noreferrer" title={alt}>
      <img
        src={`/correo/${archivo}`}
        width={26}
        height={26}
        alt={alt}
        className="inline-block align-middle mx-[7px]"
      />
    </a>
  );
  return (
    <div
      className="px-[30px] py-6 text-center"
      style={{ backgroundColor: fondoFranja }}
    >
      <p
        className="text-[15px] font-bold m-0"
        style={{ color: colorPrimario }}
      >
        {company?.name || "Empresa"}
      </p>
      {company?.tagline && (
        <p className="text-xs text-gray-600 mt-1 mb-0">{company.tagline}</p>
      )}
      {(company?.instagram || company?.facebook || company?.sitio_web) && (
        <p className="mt-3.5 mb-0">
          {company.instagram &&
            icono(company.instagram, "instagram.png", "Instagram")}
          {company.facebook &&
            icono(company.facebook, "facebook.png", "Facebook")}
          {company.sitio_web && icono(company.sitio_web, "web.png", "Sitio web")}
        </p>
      )}
    </div>
  );
}
