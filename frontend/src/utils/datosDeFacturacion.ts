import { emailProblem } from "./phone";
import type {
  DatosDeRazonSocial,
  RazonSocial,
} from "../services/razonesSociales.service";

// LAS RAZONES SOCIALES DE LA FICHA DEL CLIENTE (migración 184, doc 19
// §9.12). Las reglas puras de la tarjeta «Datos de facturación»: qué
// cambió y si los correos sirven. La limpieza de verdad la hace el motor
// (`api-rest/src/facturacion/datos-del-receptor.ts`).

export type BorradorDeRazonSocial = {
  rut: string;
  razon_social: string;
  giro: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  correo_facturacion: string;
  referencias_exigidas: string[];
};

const TEXTOS = [
  "razon_social",
  "giro",
  "direccion",
  "comuna",
  "ciudad",
  "correo_facturacion",
] as const;

/** El borrador de una razón social guardada, o uno vacío para agregar. */
export const borradorDeRazonSocial = (
  r?: RazonSocial | null,
): BorradorDeRazonSocial => ({
  rut: r?.rut || "",
  razon_social: r?.razon_social || "",
  giro: r?.giro || "",
  direccion: r?.direccion || "",
  comuna: r?.comuna || "",
  ciudad: r?.ciudad || "",
  correo_facturacion: r?.correo_facturacion || "",
  referencias_exigidas: r?.referencias_exigidas || [],
});

/** Lo que cambió respecto de la guardada: solo eso viaja al motor. Una
 *  casilla vaciada viaja como '' y el motor la deja en null. Sin una
 *  guardada (agregar), viaja todo. */
export const cambiosDeRazonSocial = (
  antes: RazonSocial | null,
  borrador: BorradorDeRazonSocial,
): DatosDeRazonSocial => {
  const previo = borradorDeRazonSocial(antes);
  const cambios: DatosDeRazonSocial = {};
  if (!antes || borrador.rut !== previo.rut) cambios.rut = borrador.rut;
  for (const campo of TEXTOS) {
    if (!antes || borrador[campo].trim() !== previo[campo].trim())
      cambios[campo] = borrador[campo].trim();
  }
  const juntas = (lista: string[]) => [...lista].sort().join(",");
  if (
    !antes ||
    juntas(borrador.referencias_exigidas) !==
      juntas(previo.referencias_exigidas)
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
