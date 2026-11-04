import { emailProblem } from "./phone";

// LOS DATOS DE FACTURACIÓN DE LA FICHA DEL CLIENTE (migración 184).
// Las reglas puras de la tarjeta «Datos de facturación»: qué cambió y si
// los correos sirven. La limpieza de verdad la hace el motor
// (`api-rest/src/facturacion/datos-del-receptor.ts`).

export interface ClienteConFacturacion {
  id: string;
  rut?: string | null;
  razon_social?: string | null;
  giro?: string | null;
  direccion_facturacion?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
  correo_facturacion?: string | null;
  referencias_exigidas?: string[] | null;
}

export type BorradorDeFacturacion = {
  rut: string;
  razon_social: string;
  giro: string;
  direccion_facturacion: string;
  comuna: string;
  ciudad: string;
  correo_facturacion: string;
  referencias_exigidas: string[];
};

const TEXTOS = [
  "razon_social",
  "giro",
  "direccion_facturacion",
  "comuna",
  "ciudad",
  "correo_facturacion",
] as const;

export const borradorDeFacturacion = (
  c: ClienteConFacturacion,
): BorradorDeFacturacion => ({
  rut: c.rut || "",
  razon_social: c.razon_social || "",
  giro: c.giro || "",
  direccion_facturacion: c.direccion_facturacion || "",
  comuna: c.comuna || "",
  ciudad: c.ciudad || "",
  correo_facturacion: c.correo_facturacion || "",
  referencias_exigidas: c.referencias_exigidas || [],
});

/** Lo que cambió respecto de la ficha guardada: solo eso viaja al motor.
 *  Una casilla vaciada viaja como '' y el motor la deja en null. */
export const cambiosDeFacturacion = (
  cliente: ClienteConFacturacion,
  borrador: BorradorDeFacturacion,
): Partial<BorradorDeFacturacion> => {
  const antes = borradorDeFacturacion(cliente);
  const cambios: Partial<BorradorDeFacturacion> = {};
  if (borrador.rut !== antes.rut) cambios.rut = borrador.rut;
  for (const campo of TEXTOS) {
    if (borrador[campo].trim() !== antes[campo].trim())
      cambios[campo] = borrador[campo].trim();
  }
  const juntas = (lista: string[]) => [...lista].sort().join(",");
  if (
    juntas(borrador.referencias_exigidas) !== juntas(antes.referencias_exigidas)
  )
    cambios.referencias_exigidas = borrador.referencias_exigidas;
  return cambios;
};

/** Los correos de la casilla: separados por coma, punto y coma o espacio. */
export const correosDe = (valor: string | null | undefined): string[] =>
  (valor ?? "")
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);

/** El primer correo que no sirve, o null si todos sirven. */
export const problemaDeCorreos = (valor: string): string | null => {
  for (const correo of correosDe(valor)) {
    if (emailProblem(correo)) return `«${correo}» no parece un correo válido.`;
  }
  return null;
};
