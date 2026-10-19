// LOS DATOS DE UN RESPALDO DE EXPERIENCIA (decisión 34 del doc 17, 19-10):
// una orden de compra o una factura de la carpeta de la empresa, con lo que
// pide el anexo de experiencia (mandante, contrato, año, monto y número).
// Viven en oportunidades_documentos.datos (migración 150).

export const TIPO_RESPALDO = 'respaldo_experiencia';

export type DatosDeRespaldo = {
  /** Número de la orden de compra o de la factura. */
  numero: string;
  mandante: string | null;
  contrato: string | null;
  anio: number | null;
  /** Pesos, con impuestos. */
  monto: number | null;
  /** De dónde salieron: la ficha pública de Mercado Público o la empresa. */
  fuente: 'mercado_publico' | 'manual';
  /** El N° del evento de Eventia del que se trajo (decisión 45, 19-10): así
   *  no se trae dos veces ni se cuenta dos veces en el anexo. */
  evento?: number;
};

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

const entero = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d]/g, '')) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max
    ? n
    : null;
};

/** Revisa los datos que llegan de la pantalla (JSON). Devuelve los datos
 *  limpios, o el problema en palabras. */
export function datosDeRespaldo(
  crudo: string | undefined,
): DatosDeRespaldo | { problema: string } {
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(crudo ?? '') as Record<string, unknown>;
  } catch {
    return { problema: 'Faltan los datos del respaldo (número, mandante...).' };
  }
  const numero = texto(v?.numero, 60);
  if (!numero) {
    return { problema: 'Falta el número de la orden de compra o la factura.' };
  }
  const evento = entero(v.evento, 1, 1_000_000_000);
  return {
    numero,
    mandante: texto(v.mandante, 300),
    contrato: texto(v.contrato, 300),
    anio: entero(v.anio, 1990, 2100),
    monto: entero(v.monto, 0, 100_000_000_000),
    fuente: v.fuente === 'mercado_publico' ? 'mercado_publico' : 'manual',
    ...(evento ? { evento } : {}),
  };
}

/** Solo los datos del respaldo, sin lo que se le sumó al leerlo (el
 *  archivo, el id de la fila): lo que se guarda. */
export const soloLosDatos = (d: DatosDeRespaldo): DatosDeRespaldo => ({
  numero: d.numero,
  mandante: d.mandante,
  contrato: d.contrato,
  anio: d.anio,
  monto: d.monto,
  fuente: d.fuente,
  ...(d.evento ? { evento: d.evento } : {}),
});

/** Un respaldo como lo lee la IA del anexo de experiencia. */
export const textoDelRespaldo = (d: DatosDeRespaldo): string =>
  [
    `N° ${d.numero}`,
    d.mandante,
    d.contrato,
    d.anio ? String(d.anio) : null,
    d.monto !== null
      ? `$${d.monto.toLocaleString('es-CL')} con impuestos`
      : null,
    d.evento ? `es el evento N° ${d.evento} de Eventia` : null,
  ]
    .filter((x): x is string => Boolean(x))
    .join(' · ');
