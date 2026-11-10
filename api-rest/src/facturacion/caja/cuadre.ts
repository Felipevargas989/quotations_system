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
 * - §9.45: la venta es del turno en que se cobró. Las solicitudes de
 *   recepción cuentan como lo emitido: la pendiente, la rechazada (la plata
 *   entró; solo no va al SII) y la aprobada cuyo documento no salió. La
 *   aprobada con su documento emitido cuenta UNA vez: por el documento
 *   (`conLasSolicitudes`).
 */

export interface DocumentoDelTurno {
  id: number;
  tipo: number;
  folio: number | null;
  estado: string;
  total: number;
  medio_de_pago: string | null;
  emitido_en: string | null;
  /** §9.45: la solicitud de recepción que esta fila representa (su id);
   *  nulo en un documento. */
  solicitud_id?: number | null;
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

/** Una solicitud de recepción del turno, como la lee la caja (§9.45). */
export interface SolicitudDelTurno {
  id: number;
  tipo: number;
  estado: string;
  total: number;
  medio_de_pago: string;
  created_at: string;
  detalle: DocumentoDelTurno['detalle'];
  documento_id: number | null;
  /** El estado del documento que la emitió, si hay. */
  documento_estado: string | null;
}

/** Lo que cuenta en la caja: lo emitido y las solicitudes (§9.45). */
export const cuentaEnLaCaja = (d: Pick<DocumentoDelTurno, 'estado'>) =>
  d.estado === 'emitido' || d.estado.startsWith('solicitud_');

/** La solicitud que cuenta por sí misma: todas, menos la aprobada cuyo
 *  documento salió (ese cuenta por el documento). */
export const cuentaLaSolicitud = (s: SolicitudDelTurno) =>
  !(s.estado === 'aprobada' && s.documento_estado === 'emitido');

/**
 * Los documentos del turno con sus solicitudes (§9.45): cada solicitud que
 * cuenta entra como una fila «solicitud_pendiente», «solicitud_rechazada» o
 * «solicitud_aprobada» (su documento no salió: queda por confirmar o lo
 * rechazó facturacion.cl), y ese documento sale de la lista para que la
 * plata no se cuente dos veces ni se avise como «por confirmar».
 */
export const conLasSolicitudes = <D extends DocumentoDelTurno>(
  documentos: D[],
  solicitudes: SolicitudDelTurno[],
): (D | DocumentoDelTurno)[] => {
  const cuentan = solicitudes.filter(cuentaLaSolicitud);
  const tapados = new Set(
    cuentan.map((s) => s.documento_id).filter((id): id is number => !!id),
  );
  return [
    ...documentos.filter((d) => !tapados.has(d.id)),
    ...cuentan.map(
      (s): DocumentoDelTurno => ({
        id: s.id,
        solicitud_id: s.id,
        tipo: s.tipo,
        folio: null,
        estado:
          s.estado === 'rechazada'
            ? 'solicitud_rechazada'
            : s.estado === 'aprobada'
              ? 'solicitud_aprobada'
              : 'solicitud_pendiente',
        total: Number(s.total),
        medio_de_pago: s.medio_de_pago,
        emitido_en: s.created_at,
        detalle: s.detalle ?? [],
      }),
    ),
  ];
};

/** El monto con IVA de una línea: la boleta lo trae con IVA; la factura,
 *  en neto (con su descuento). */
export const conIvaDe = (
  tipo: number,
  l: DocumentoDelTurno['detalle'][number],
) => {
  const base =
    (l.cantidad ?? 0) * (l.precio ?? 0) * (1 - (l.descuento ?? 0) / 100);
  return Math.round(tipo === 39 ? base : base * (1 + IVA));
};

/** El nombre del ítem sin la cabaña del comienzo («Cabaña 4 · …»). */
const nombreDelItem = (descripcion: string) =>
  descripcion.includes(' · ')
    ? descripcion.slice(descripcion.indexOf(' · ') + 3)
    : descripcion;

/**
 * Lo vendido por ítem, con su cantidad y su monto con IVA: los del tarifario
 * por su ítem y las líneas a mano por lo que dicen. Lo usan el cuadre de la
 * caja y «Lo vendido».
 */
export const vendidoPorItem = (
  documentos: Pick<DocumentoDelTurno, 'tipo' | 'detalle'>[],
): ItemVendido[] => {
  const items = new Map<string, ItemVendido>();
  for (const d of documentos)
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
  return [...items.values()].sort(
    (a, b) => b.monto - a.monto || a.nombre.localeCompare(b.nombre, 'es'),
  );
};

export const cuadrar = (
  turno: TurnoParaCuadrar,
  documentos: DocumentoDelTurno[],
  retiros: { monto: number }[],
) => {
  // §9.45: lo emitido y las solicitudes del turno (`conLasSolicitudes`).
  const emitidos = documentos.filter(cuentaEnLaCaja);
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

  return {
    lineas,
    vendido: emitidos.reduce((s, d) => s + Number(d.total), 0),
    retiros: totalRetiros,
    esperado,
    declarado: declaradoTotal,
    diferencia: declaradoTotal == null ? null : declaradoTotal - esperado,
    porConfirmar: documentos.filter((d) => d.estado === 'por_confirmar').length,
    vendidoPorItem: vendidoPorItem(emitidos),
  };
};
