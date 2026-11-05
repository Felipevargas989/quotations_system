import { normalizarRut, revisarRut } from "./rut";
import type {
  DatosDeOrdenDeCompra,
  OrdenDeCompra,
  PropuestaDeOC,
} from "../services/ordenesDeCompra.service";

// LAS ÓRDENES DE COMPRA DE LA PESTAÑA «FACTURACIÓN» (doc 19, paso 2a): qué
// falta para guardar y qué cambió. La revisión de verdad la hace el motor.

export type BorradorDeOC = {
  numero: string;
  fecha: string;
  rut: string;
  razon_social: string;
  descripcion: string;
  neto?: number;
  iva?: number;
  total?: number;
  /** '' = sin PDF. */
  documento_id: string;
  /** «pdf» si lo llenó BelIA leyendo el PDF. */
  origen?: "manual" | "pdf";
};

export const borradorDeOC = (oc?: OrdenDeCompra | null): BorradorDeOC => ({
  numero: oc?.numero ?? "",
  fecha: oc?.fecha ?? "",
  rut: oc?.rut ?? "",
  razon_social: oc?.razon_social ?? "",
  descripcion: oc?.descripcion ?? "",
  neto: oc?.neto ?? undefined,
  iva: oc?.iva ?? undefined,
  total: oc?.total ?? undefined,
  documento_id: oc?.documento_id ? String(oc.documento_id) : "",
});

/** Lo que falta para poder guardar; vacío si está lista. */
export const faltaEnLaOC = (b: BorradorDeOC): string[] => {
  const falta: string[] = [];
  if (!b.numero.trim()) falta.push("el N°");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) falta.push("la fecha");
  if (!b.total || b.total <= 0) falta.push("el total");
  if (b.rut && revisarRut(b.rut)) falta.push("un RUT válido");
  return falta;
};

/** Lo que viaja al motor: al agregar, todo; al editar, lo que cambió. */
export const cambiosDeOC = (
  antes: OrdenDeCompra | null,
  b: BorradorDeOC,
): DatosDeOrdenDeCompra => {
  const ahora: DatosDeOrdenDeCompra = {
    numero: b.numero.trim(),
    fecha: b.fecha,
    rut: b.rut ? normalizarRut(b.rut) : null,
    razon_social: b.razon_social.trim() || null,
    descripcion: b.descripcion.trim() || null,
    neto: b.neto ?? null,
    iva: b.iva ?? null,
    total: b.total ?? 0,
    documento_id: b.documento_id ? Number(b.documento_id) : null,
  };
  if (!antes) return b.origen ? { ...ahora, origen: b.origen } : ahora;
  const cambios: DatosDeOrdenDeCompra = {};
  for (const campo of Object.keys(ahora) as (keyof DatosDeOrdenDeCompra)[]) {
    if ((ahora[campo] ?? null) !== (antes[campo] ?? null))
      (cambios as Record<string, unknown>)[campo] = ahora[campo];
  }
  return cambios;
};

/** El formulario lleno con lo que leyó BelIA, listo para confirmar. */
export const borradorDeLaLectura = (
  p: PropuestaDeOC,
  documentoId: number,
): BorradorDeOC => ({
  numero: p.numero.slice(0, 18),
  fecha: p.fecha ?? "",
  rut: p.rut ?? "",
  razon_social: p.razon_social ?? "",
  descripcion: p.descripcion ?? "",
  neto: p.neto ?? undefined,
  iva: p.iva ?? undefined,
  total: p.total ?? undefined,
  documento_id: String(documentoId),
  origen: "pdf",
});

/** «2026-10-14» → «14-10-2026», sin pasar por Date (no se corre un día). */
export const fechaCorta = (iso: string): string => {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}-${m}-${a}` : iso;
};
