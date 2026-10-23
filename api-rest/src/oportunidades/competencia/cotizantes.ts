import { normalizarRut } from '../historia/ganadores';
import type { OfertaLeida, ProcesoDelActa } from './competencia';

// QUIÉN COTIZÓ EN UNA COMPRA ÁGIL (decisión 71 del doc 17, 23-10). Las
// compras ágiles no tienen acta (0 de 3.177 en la base), y casi toda la
// historia de Valle del Sol con el Estado es compra ágil. Mercado Público
// trae en su detalle `proveedores_cotizando`: mientras está abierta viene
// vacío. Lo que se mide es si se llena al cerrar. Hasta ver la forma real,
// se lee con cuidado: solo entra un elemento con un RUT válido; el nombre,
// el monto y si fue elegido se buscan por el nombre de su campo. El motor
// anota en el registro los nombres de los campos (no los datos) la primera
// vez que llegan, para ajustar esto con lo que de verdad venga.

const RUT = /^\d{6,9}-[\dK]$/;

const numero = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(
      v
        .replace(/[^\d,.-]/g, '')
        .replace(/\./g, '')
        .replace(',', '.'),
    );
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const campo = (x: Record<string, unknown>, patron: RegExp): unknown =>
  Object.entries(x).find(([k]) => patron.test(k))?.[1];

const verdadero = (v: unknown): boolean =>
  v === true ||
  v === 1 ||
  (typeof v === 'string' &&
    /^(true|si|sí|s|1|seleccionad[oa])$/i.test(v.trim()));

/** Los nombres de los campos de quien cotizó, para el registro. */
export const camposDeLosCotizantes = (detalle: unknown): string[] => {
  const lista = (detalle as { proveedores_cotizando?: unknown })
    ?.proveedores_cotizando;
  const primero = Array.isArray(lista) ? (lista[0] as unknown) : null;
  return primero && typeof primero === 'object'
    ? Object.keys(primero as Record<string, unknown>).sort()
    : [];
};

/** Quienes cotizaron, en filas de mp_ofertas (una por RUT). */
export const cotizantesDeCompraAgil = (
  detalle: unknown,
  p: ProcesoDelActa,
): OfertaLeida[] => {
  const lista = (detalle as { proveedores_cotizando?: unknown })
    ?.proveedores_cotizando;
  if (!Array.isArray(lista)) return [];
  const porRut = new Map<string, OfertaLeida>();
  for (const x of lista) {
    if (!x || typeof x !== 'object') continue;
    const f = x as Record<string, unknown>;
    const valorDelRut = campo(f, /rut/i);
    const rut = normalizarRut(
      typeof valorDelRut === 'string' || typeof valorDelRut === 'number'
        ? String(valorDelRut)
        : '',
    );
    if (!RUT.test(rut)) continue;
    // El nombre, en un campo que no sea el del RUT («rut_proveedor»).
    const nombre = Object.entries(f).find(
      ([k, v]) =>
        /(razon|nombre|proveedor)/i.test(k) &&
        !/rut/i.test(k) &&
        typeof v === 'string',
    )?.[1];
    const monto = numero(campo(f, /(monto|total|precio|valor)/i));
    const elegido = verdadero(campo(f, /(seleccion|adjudic|ganador|elegid)/i));
    porRut.set(rut, {
      codigo: p.codigo,
      rut,
      proveedor:
        typeof nombre === 'string' && nombre.trim() ? nombre.trim() : rut,
      total_ofertado: monto,
      total_adjudicado: elegido ? (monto ?? 0) : 0,
      adjudicada: elegido,
      lineas: 1,
      detalle: null,
      proceso: p.nombre,
      organismo_codigo: p.organismo_codigo,
      organismo: p.organismo,
      region: p.region,
      comuna: p.comuna,
      fecha: p.fecha_publicacion?.slice(0, 10) ?? null,
    });
  }
  return [...porRut.values()];
};
