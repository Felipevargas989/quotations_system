// ---------- LA CUENTA DEL DINERO, EN EL BACKEND (Fase 1, 27-07-2026) ----------
// Hasta ahora el backend guardaba los totales tal como llegaban del
// navegador. Este módulo rehace la cuenta a partir de los ÍTEMS guardados
// (la misma foto que arma buildItemsSnapshot en el frontend) y permite
// rechazar cualquier guardado cuyos números no calcen al peso.
//
// LA FÓRMULA ES LA MISMA de computeTotals en
// frontend/src/pages/quotations/QuotationForm.tsx — misma cuenta, mismo
// orden de redondeos. Si mañana se agrega otro número al total, se cambia
// ALLÁ y ACÁ, y la de acá es la que manda.
//
// Reglas replicadas:
//  - variables = Σ por caja: (Σ precio×cantidad) × personas de la caja
//  - fijos     = Σ precio×cantidad
//  - subtotal  = variables + fijos
//  - descuento = por % (tope 100) o por monto (tope: el subtotal);
//                solo el modo activo viaja con valor, el otro va en 0
//  - propina   = variables × % (tope 100), sin IVA, se suma al final
//  - total     = (subtotal − descuento) + propina
//
// Cajas viejas (anteriores al Cotizador 2.0) no traen personas/audiencia:
// se asume el total de personas del evento y audiencia de adultos, que es
// como se calculaba entonces.

interface SnapshotItem {
  precio?: number | null;
  quantity?: number | null;
  // Solo los traen los servicios fijos; sirven para resolver fotos viejas.
  tipo_calculo?: string | null;
  precio_por_persona?: number | null;
  min_precio?: number | null;
  max_precio?: number | null;
}

interface VariableBox {
  audience?: string | null;
  people?: number | null;
  items?: SnapshotItem[] | null;
}

export interface MoneySnapshot {
  fixed_services?: SnapshotItem[] | null;
  variable_services?: VariableBox[] | null;
}

export interface MoneyInput {
  items?: MoneySnapshot | null;
  people_count?: number | null;
  children_count?: number | null;
  discount_percentage?: number | null;
  discount_amount?: number | null;
  tip_percentage?: number | null;
}

export interface MoneyTotals {
  variableGrandTotal: number;
  fixedTotal: number;
  valuePerPerson: number;
  subtotalAmount: number;
  discountAmount: number;
  tipAmount: number;
  totalAmount: number;
}

const n = (v: number | null | undefined): number => Number(v) || 0;

// Cantidad ausente o en 0 vale 1 (misma regla de Post-Venta: `quantity || 1`).
const qty = (v: number | null | undefined): number => n(v) || 1;

// Regla del catálogo para el precio de un servicio fijo según su tipo de
// cálculo (espejo exacto de useServices.calculateFixedServicePrice). Se usa
// al AGREGAR un fijo — cotizador y Post-Venta — para que el precio quede
// RESUELTO en la foto; de ahí en adelante es un hecho guardado.
export const resolveFixedServicePrice = (
  s: {
    precio?: number | null;
    tipo_calculo?: string | null;
    precio_por_persona?: number | null;
    min_precio?: number | null;
    max_precio?: number | null;
  },
  peopleCount: number,
): number => {
  const ppp = n(s.precio_por_persona);
  switch (s.tipo_calculo) {
    case 'variable_con_limites': {
      let p = ppp * n(peopleCount);
      if (n(s.min_precio) && p < n(s.min_precio)) p = n(s.min_precio);
      if (n(s.max_precio) && p > n(s.max_precio)) p = n(s.max_precio);
      return Math.round(p);
    }
    case 'fijo_variable':
      return Math.round(n(s.precio) + ppp * n(peopleCount));
    default:
      return Math.round(n(s.precio));
  }
};

export const computeMoney = (input: MoneyInput): MoneyTotals => {
  const items = input.items || {};
  const boxes = items.variable_services || [];
  const fixed = items.fixed_services || [];

  const peopleCount = n(input.people_count);
  const adults = Math.max(0, peopleCount - n(input.children_count));

  // Personas de una caja: la resuelta que viene en la foto; si es una
  // caja vieja sin ese dato, el total del evento (regla pre-2.0).
  const boxPeople = (box: VariableBox): number =>
    box.people == null ? peopleCount : n(box.people);

  const perPersonOf = (box: VariableBox): number =>
    (box.items || []).reduce((s, it) => s + n(it.precio) * qty(it.quantity), 0);

  const variableGrandTotal = Math.round(
    boxes.reduce((sum, box) => sum + perPersonOf(box) * boxPeople(box), 0),
  );

  // Precio de un fijo. Las fotos ACTUALES traen el precio ya resuelto
  // (precio_calculado); las anteriores al 24-07 guardaban el precio base
  // sin resolver (0 en los "por persona"). Un fijo con precio 0 y tarifa
  // por persona > 0 solo puede ser una foto vieja: se resuelve con la
  // regla del catálogo (useServices.calculateFixedServicePrice).
  const fixedPrice = (it: SnapshotItem): number => {
    const precio = n(it.precio);
    const ppp = n(it.precio_por_persona);
    if (precio !== 0 || ppp <= 0) return precio;
    if (it.tipo_calculo === 'fijo_variable') return precio + ppp * peopleCount;
    if (it.tipo_calculo === 'variable_con_limites') {
      let p = ppp * peopleCount;
      if (n(it.min_precio) && p < n(it.min_precio)) p = n(it.min_precio);
      if (n(it.max_precio) && p > n(it.max_precio)) p = n(it.max_precio);
      return p;
    }
    return precio;
  };

  const fixedTotal = Math.round(
    fixed.reduce((sum, it) => sum + fixedPrice(it) * qty(it.quantity), 0),
  );

  // value_per_person (columna histórica) = valor por ADULTO de las cajas
  // que cubren a todos los adultos.
  const valuePerPerson = Math.round(
    boxes.reduce((sum, box) => {
      if ((box.audience || 'adultos') !== 'adultos') return sum;
      if (boxPeople(box) !== adults) return sum;
      return sum + perPersonOf(box);
    }, 0),
  );

  const subtotalAmount = Math.round(variableGrandTotal + fixedTotal);

  // Solo el modo activo del descuento viaja con valor; el otro va en 0.
  const pct = Math.min(n(input.discount_percentage), 100);
  const discountAmount =
    pct > 0
      ? Math.round(subtotalAmount * (pct / 100))
      : Math.min(subtotalAmount, Math.round(n(input.discount_amount)));

  const finalTotal = Math.round(subtotalAmount - discountAmount);

  // Propina: % sobre las variables, DESPUÉS del IVA (no lleva IVA).
  // null = sin propina (así viaja cuando el interruptor está apagado).
  const tipPct =
    input.tip_percentage == null
      ? 0
      : Math.min(Math.max(n(input.tip_percentage), 0), 100);
  const tipAmount = Math.round(variableGrandTotal * (tipPct / 100));

  return {
    variableGrandTotal,
    fixedTotal,
    valuePerPerson,
    subtotalAmount,
    discountAmount,
    tipAmount,
    totalAmount: finalTotal + tipAmount,
  };
};

// Lo que el guardado dice de sí mismo, para compararlo con la cuenta.
export interface DeclaredMoney {
  fixed_value?: number | null;
  value_per_person?: number | null;
  subtotal_amount?: number | null;
  discount_percentage?: number | null;
  discount_amount?: number | null;
  tip_percentage?: number | null;
  tip_amount?: number | null;
  total_amount?: number | null;
}

export interface MoneyMismatch {
  campo: string;
  enviado: number;
  calculado: number;
}

// Compara lo declarado contra la cuenta rehecha. Lista vacía = todo calza.
// En modo % el frontend guarda discount_amount en 0 (el monto vive en la
// cuenta, no en la columna); por eso ahí se exige 0, no el monto.
export const verifyMoney = (
  declared: DeclaredMoney,
  input: MoneyInput,
): MoneyMismatch[] => {
  const t = computeMoney(input);
  const pctMode = n(input.discount_percentage) > 0;

  const checks: [string, number, number][] = [
    ['fixed_value', n(declared.fixed_value), t.fixedTotal],
    ['value_per_person', n(declared.value_per_person), t.valuePerPerson],
    ['subtotal_amount', n(declared.subtotal_amount), t.subtotalAmount],
    [
      'discount_amount',
      n(declared.discount_amount),
      pctMode ? 0 : t.discountAmount,
    ],
    ['tip_amount', n(declared.tip_amount), t.tipAmount],
    ['total_amount', n(declared.total_amount), t.totalAmount],
  ];

  return checks
    .filter(([, enviado, calculado]) => enviado !== calculado)
    .map(([campo, enviado, calculado]) => ({ campo, enviado, calculado }));
};

// ¿Este guardado trae plata que verificar? Una solicitud sin ítems y con
// todo en cero pasa de largo, igual que hoy.
export const hasMoneyToVerify = (
  declared: DeclaredMoney,
  items?: MoneySnapshot | null,
): boolean => {
  const hasItems =
    !!items &&
    ((items.fixed_services || []).length > 0 ||
      (items.variable_services || []).length > 0);
  const declaresMoney =
    n(declared.total_amount) !== 0 ||
    n(declared.subtotal_amount) !== 0 ||
    n(declared.fixed_value) !== 0 ||
    n(declared.value_per_person) !== 0 ||
    n(declared.discount_amount) !== 0 ||
    n(declared.tip_amount) !== 0;
  return hasItems || declaresMoney;
};
