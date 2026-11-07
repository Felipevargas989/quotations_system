/**
 * EL REPARTO DE UN COBRO POR CABAÑA (doc 19 §9.4, paso 3a)
 *
 * El administrador deja un total (el alojamiento de una delegación);
 * recepción lo reparte por cabaña y emite una boleta por cabaña. Eventia no
 * deja emitir si lo repartido no suma el total (maqueta del 04-11: «Lo
 * repartido suma el total: falta $0»). Puro: no lee la base.
 */

export interface LineaDelCobro {
  id: number;
  cabana: string;
  monto: number;
  correo: string | null;
  /** La boleta, si ya se emitió. */
  documento_id: number | null;
}

export interface CobroConLineas {
  id: number;
  descripcion: string;
  total: number;
  lineas: LineaDelCobro[];
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Cuánto va repartido y boleteado, y cuánto falta (negativo = sobra). */
export const repartoDelCobro = (c: CobroConLineas) => {
  const repartido = c.lineas.reduce((s, l) => s + l.monto, 0);
  const boleteado = c.lineas
    .filter((l) => l.documento_id != null)
    .reduce((s, l) => s + l.monto, 0);
  return {
    repartido,
    boleteado,
    falta: c.total - repartido,
    porEmitir: c.lineas.filter((l) => l.documento_id == null).length,
  };
};

/** Por qué no se puede emitir todavía; vacío si se puede. */
export const problemasParaEmitir = (c: CobroConLineas): string[] => {
  const r = repartoDelCobro(c);
  if (r.porEmitir === 0) return ['No queda ninguna cabaña por boletear'];
  if (r.falta > 0)
    return [
      `Lo repartido suma ${pesos(r.repartido)}: faltan ${pesos(r.falta)} para el total`,
    ];
  if (r.falta < 0) return [`Lo repartido pasa el total por ${pesos(-r.falta)}`];
  return [];
};

/**
 * La glosa de la boleta: la cabaña y el cobro. Cabe siempre en los 80
 * caracteres de la línea: la cabaña hasta 22 y el cobro hasta 55
 * (migración 187).
 */
export const glosaDeLaBoleta = (
  c: Pick<CobroConLineas, 'descripcion'>,
  l: Pick<LineaDelCobro, 'cabana'>,
) => `${l.cabana.trim()} · ${c.descripcion.trim()}`;
