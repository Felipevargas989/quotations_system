import type { CSSProperties } from "react";

/**
 * EL CÍRCULO DE MARCA (22-09-2026). El redondel con el logo de la empresa
 * que encabeza el formulario público, el documento de la cotización y la
 * ficha de cocina. Una sola regla para los tres:
 *  - CON logo: fondo blanco y borde fino del color principal. Nació porque
 *    La Calma de Rita subió un logo transparente del mismo burdeos que su
 *    color principal y quedó invisible (burdeos sobre burdeos).
 *  - SIN logo: el color principal de fondo y las iniciales encima.
 * El logo entra completo (contain), nunca recortado.
 */
export function estiloDelCirculoDeMarca(
  brandP: string,
  onBrandP: string,
  tieneLogo: boolean,
): CSSProperties {
  return tieneLogo
    ? { backgroundColor: "#fff", border: `2px solid ${brandP}` }
    : { backgroundColor: brandP, color: onBrandP };
}

/** Las mismas reglas, en CSS, para los documentos que se arman como HTML. */
export function cssDelCirculoDeMarca(
  selector: string,
  tamano: number,
  brandP: string,
  onBrandP: string,
): string {
  return `
    ${selector} { width:${tamano}px; height:${tamano}px; border-radius:50%; background:${brandP}; color:${onBrandP}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:${Math.round(tamano * 0.36)}px; overflow:hidden; }
    ${selector} img { width:100%; height:100%; object-fit:contain; padding:${tamano >= 80 ? 4 : 3}px; box-sizing:border-box; }
    ${selector}.con-logo { background:#fff; border:2px solid ${brandP}; }`;
}
