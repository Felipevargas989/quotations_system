import { normalizarRut } from '../../people/utils/rut';
import { textoLimpio } from '../archivo/texto';
import type { DtePedido } from './borrador';

const FACTURA = 33;
const BOLETA = 39;

/** Lo que llega de la pantalla, con las mismas reglas de limpieza. La
 *  boleta no va contra una OC ni lleva referencias. */
export const normalizada = (p: DtePedido): DtePedido => {
  const boleta = p.tipo === BOLETA;
  return {
    tipo: boleta ? BOLETA : FACTURA,
    orden_de_compra_id: boleta ? null : (p.orden_de_compra_id ?? null),
    receptor: boleta
      ? {
          rut: '',
          razon_social: '',
          giro: null,
          direccion: null,
          comuna: null,
          ciudad: null,
          // Como en la boleta suelta: el correo en minúscula.
          correo: (p.receptor?.correo ?? '').trim().toLowerCase() || null,
        }
      : {
          ...p.receptor,
          rut:
            normalizarRut(p.receptor?.rut ?? '') ??
            textoLimpio(p.receptor?.rut),
          razon_social: textoLimpio(p.receptor?.razon_social),
        },
    lineas: (p.lineas ?? []).map((l) => ({
      descripcion: textoLimpio(l.descripcion),
      descripcion_larga: (l.descripcion_larga ?? '').trim() || null,
      cantidad: Number(l.cantidad),
      precio: Number(l.precio),
      // El descuento va solo en la factura (§9.22).
      descuento:
        !boleta && Number(l.descuento) > 0 ? Number(l.descuento) : null,
      // §9.43: el ítem del tarifario (`del-tarifario.ts`), para «Lo vendido».
      tarifario_id: l.tarifario_id ?? null,
    })),
    referencias: boleta
      ? []
      : (p.referencias ?? []).map((r) => ({
          tipo: r.tipo,
          folio: textoLimpio(r.folio),
          fecha: (r.fecha ?? '').trim(),
          razon: textoLimpio(r.razon) || null,
        })),
    pedir_siempre: boleta ? [] : [...new Set(p.pedir_siempre ?? [])],
    // §9.22: la factura va al contado o a crédito (30 días si no se dice).
    forma_de_pago: boleta ? null : p.forma_de_pago === 1 ? 1 : 2,
    plazo_dias: boleta || p.forma_de_pago === 1 ? null : (p.plazo_dias ?? 30),
    // §9.43: con qué se pagó, solo al contado.
    medio_de_pago:
      !boleta && p.forma_de_pago === 1 ? (p.medio_de_pago ?? null) : null,
    cliente_id: boleta ? null : (p.cliente_id ?? null),
    // §9.32: la factura puede elegir su fecha; la boleta, la del día.
    fecha_emision: boleta ? null : (p.fecha_emision ?? '').trim() || null,
  };
};
