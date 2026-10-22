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
  /** El menú guardado que es la BASE de la caja (Felipe, 17-10: "que se
   *  base mayoritariamente en los paquetes"); 0 solo si ninguno sirve y la
   *  caja va entera con sueltos. */
  menu_id: number;
  /** Platos del menú guardado que se sacan para adaptarlo; vacío si va tal
   *  cual. Opcional acá (las pruebas lo omiten); el esquema lo exige. */
  quitar?: number[];
  /** Sueltos de la categoría: lo que se le agrega al menú (el plato que
   *  reemplaza a uno quitado, un agregado), o la caja entera sin menú. */
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
          menu_id: {
            type: 'integer',
            description:
              'El menú guardado que es la base de la caja. 0 solo si ningún menú guardado de esa comida sirve de base.',
          },
          quitar: {
            type: 'array',
            description:
              'Ids de los platos del menú guardado que se sacan para adaptarlo. Vacío si el menú va tal cual o si menu_id es 0.',
            items: { type: 'integer' },
          },
          servicios: {
            type: 'array',
            description:
              'Sueltos de la categoría: lo que se agrega al menú (el plato que reemplaza a uno quitado, en su misma sección, o un agregado), o la caja entera si menu_id es 0.',
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
          'quitar',
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
