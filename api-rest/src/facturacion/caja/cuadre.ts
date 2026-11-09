import {
  MEDIOS_DE_PAGO,
  type MedioDePago,
} from '../facturas/pago-de-la-factura';

/**
 * EL CUADRE DE LA CAJA DE RECEPCIÓN (doc 19 §9.43, sprint 2). Puro: recibe
 * el turno, sus documentos y sus retiros, y no lee la base.
 *
 * - Lo esperado sale de los documentos emitidos del turno: el efectivo es el
 *   sencillo más lo vendido en efectivo menos los retiros; débito, crédito y
 *   transferencia, lo vendido con cada uno.
 * - Lo declarado lo anotó quien cerró, sin ver lo esperado (cierre ciego).
 * - La diferencia es declarado menos esperado: positiva sobra, negativa
 *   falta.
 * - Lo vendido: cada ítem del tarifario con su cantidad y su monto con IVA.
 */

export interface DocumentoDelTurno {
  id: number;
  tipo: number;
  folio: number | null;
  estado: string;
  total: number;
  medio_de_pago: string | null;
  emitido_en: string | null;
  detalle: {
    descripcion?: string;
    cantidad?: number;
    precio?: number;
    descuento?: number | null;
    tarifario_id?: number | null;
  }[];
}

export interface TurnoParaCuadrar {
  sencillo_inicial: number;
  declarado_efectivo: number | null;
  declarado_debito: number | null;
  declarado_credito: number | null;
  declarado_transferencia: number | null;
}

export interface LineaDelCuadre {
  medio: MedioDePago;
  vendido: number;
  esperado: number;
  declarado: number | null;
  diferencia: number | null;
  documentos: number;
}

export interface ItemVendido {
  tarifario_id: number | null;
  nombre: string;
  cantidad: number;
  monto: number;
}

const IVA = 0.19;

/** El monto con IVA de una línea: la boleta lo trae con IVA; la factura,
 *  en neto (con su descuento). */
const conIvaDe = (tipo: number, l: DocumentoDelTurno['detalle'][number]) => {
  const base =
    (l.cantidad ?? 0) * (l.precio ?? 0) * (1 - (l.descuento ?? 0) / 100);
  return Math.round(tipo === 39 ? base : base * (1 + IVA));
};

/** El nombre del ítem sin la cabaña del comienzo («Cabaña 4 · …»). */
const nombreDelItem = (descripcion: string) =>
  descripcion.includes(' · ')
    ? descripcion.slice(descripcion.indexOf(' · ') + 3)
    : descripcion;

export const cuadrar = (
  turno: TurnoParaCuadrar,
  documentos: DocumentoDelTurno[],
  retiros: { monto: number }[],
) => {
  const emitidos = documentos.filter((d) => d.estado === 'emitido');
  const totalRetiros = retiros.reduce((s, r) => s + Number(r.monto), 0);
  const declarado: Record<MedioDePago, number | null> = {
    efectivo: turno.declarado_efectivo,
    debito: turno.declarado_debito,
    credito: turno.declarado_credito,
    transferencia: turno.declarado_transferencia,
  };
  const lineas: LineaDelCuadre[] = MEDIOS_DE_PAGO.map((medio) => {
    const suyos = emitidos.filter((d) => d.medio_de_pago === medio);
    const vendido = suyos.reduce((s, d) => s + Number(d.total), 0);
    const esperado =
      medio === 'efectivo'
        ? Number(turno.sencillo_inicial) + vendido - totalRetiros
        : vendido;
    const dec = declarado[medio];
    return {
      medio,
      vendido,
      esperado,
      declarado: dec == null ? null : Number(dec),
      diferencia: dec == null ? null : Number(dec) - esperado,
      documentos: suyos.length,
    };
  });
  const cerrado = lineas.every((l) => l.declarado != null);
  const esperado = lineas.reduce((s, l) => s + l.esperado, 0);
  const declaradoTotal = cerrado
    ? lineas.reduce((s, l) => s + (l.declarado ?? 0), 0)
    : null;

  const items = new Map<string, ItemVendido>();
  for (const d of emitidos)
    for (const l of d.detalle ?? []) {
      const nombre = nombreDelItem(l.descripcion ?? '');
      const clave =
        l.tarifario_id != null ? `t${l.tarifario_id}` : `n${nombre}`;
      const item = items.get(clave) ?? {
        tarifario_id: l.tarifario_id ?? null,
        nombre,
        cantidad: 0,
        monto: 0,
      };
      item.cantidad += Number(l.cantidad ?? 0);
      item.monto += conIvaDe(d.tipo, l);
      items.set(clave, item);
    }

  return {
    lineas,
    vendido: emitidos.reduce((s, d) => s + Number(d.total), 0),
    retiros: totalRetiros,
    esperado,
    declarado: declaradoTotal,
    diferencia: declaradoTotal == null ? null : declaradoTotal - esperado,
    porConfirmar: documentos.filter((d) => d.estado === 'por_confirmar').length,
    vendidoPorItem: [...items.values()].sort((a, b) => b.monto - a.monto),
  };
};
