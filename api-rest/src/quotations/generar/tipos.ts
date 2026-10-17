// LO QUE RESPONDE LA IA AL ARMAR UNA COTIZACIÓN (doc 16, sección 6).
//
// La IA elige productos por su id y Eventia pone los precios del catálogo:
// en esta respuesta no hay ni un peso. El esquema va sin nulos a propósito
// (0 o vacío = "no hay"), para que la salida con estructura fija sea simple.

export type CajaDelPlan = {
  /** Día del evento, desde 1. */
  dia: number;
  /** Nombre EXACTO de la categoría del catálogo. */
  categoria: string;
  audiencia: 'adultos' | 'ninos';
  personas: number;
  /** Menú guardado de la categoría; 0 si la caja va con servicios sueltos. */
  menu_id: number;
  /** Servicios sueltos de la categoría (vacío si va con menú). */
  servicios: Array<{ id: number; cantidad: number }>;
};

export type FijoDelPlan = {
  /** 0 = todo el evento; 1..N = ese día. */
  dia: number;
  id: number;
  cantidad: number;
};

export type PlanDeLaIA = {
  cajas: CajaDelPlan[];
  fijos: FijoDelPlan[];
  /** AAAA-MM-DD del último día si son varios; vacío si es de un día. */
  ultimo_dia: string;
  /** 0, o 15 para tour operadores. */
  descuento_porcentaje: number;
  /** Lo que el cliente dijo que quiere gastar; monto 0 si no dijo nada. */
  presupuesto_cliente: { monto: number; por: 'persona' | 'total' };
  /** Para el equipo: qué armó, supuestos, lo que NO tenemos, la historia
   *  que usó y qué conviene preguntarle al cliente. */
  nota: string;
};

/** La forma exacta de PlanDeLaIA para la salida con estructura fija. */
export const ESQUEMA_DEL_PLAN = {
  type: 'object',
  properties: {
    cajas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dia: { type: 'integer' },
          categoria: { type: 'string' },
          audiencia: { type: 'string', enum: ['adultos', 'ninos'] },
          personas: {
            type: 'integer',
            description:
              'Cuántas personas comen o duermen en esta caja. Eventia multiplica la caja por este número.',
          },
          menu_id: { type: 'integer' },
          servicios: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                cantidad: {
                  type: 'integer',
                  description:
                    'Unidades POR PERSONA, casi siempre 1. Nunca la cantidad de personas: la caja ya se multiplica por sus personas.',
                },
              },
              required: ['id', 'cantidad'],
              additionalProperties: false,
            },
          },
        },
        required: [
          'dia',
          'categoria',
          'audiencia',
          'personas',
          'menu_id',
          'servicios',
        ],
        additionalProperties: false,
      },
    },
    fijos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dia: { type: 'integer' },
          id: { type: 'integer' },
          cantidad: { type: 'integer' },
        },
        required: ['dia', 'id', 'cantidad'],
        additionalProperties: false,
      },
    },
    ultimo_dia: { type: 'string' },
    descuento_porcentaje: { type: 'integer' },
    presupuesto_cliente: {
      type: 'object',
      properties: {
        monto: { type: 'integer' },
        por: { type: 'string', enum: ['persona', 'total'] },
      },
      required: ['monto', 'por'],
      additionalProperties: false,
    },
    nota: { type: 'string' },
  },
  required: [
    'cajas',
    'fijos',
    'ultimo_dia',
    'descuento_porcentaje',
    'presupuesto_cliente',
    'nota',
  ],
  additionalProperties: false,
} as const;
