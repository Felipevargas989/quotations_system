import type { UpdateQuotationDto } from './dto/update-quotation.dto';

// LA COTIZACIÓN DE UNA LICITACIÓN ES DE SOLO LECTURA (decisión 35 del doc
// 17, 19-10-2026). Felipe: "que la que se cree nueva no sea editable... y
// si vinculo también queda solo de lectura". Es la copia de lo postulado en
// Oportunidades (`oportunidades.quotation_id`): la reescribe entera solo
// «Armar postulación» (`CotizacionDeLaPostulacionService`, que llega a
// `update` con `desde: 'postulacion'`). Lo que no es lo postulado sigue
// abierto: el estado, los pagos, el seguimiento y los documentos.

/** Lo que dice lo postulado: lo que no se cambia a mano. */
export const LO_POSTULADO: ReadonlyArray<keyof UpdateQuotationDto> = [
  'items',
  'total_amount',
  'subtotal_amount',
  'fixed_value',
  'value_per_person',
  'discount_percentage',
  'discount_amount',
  'tip_percentage',
  'tip_amount',
  'people_count',
  'children_count',
  'event_date',
  'event_end_date',
];

export const tocaLoPostulado = (parche: UpdateQuotationDto): boolean =>
  LO_POSTULADO.some((campo) => parche[campo] !== undefined);

export const cotizacionDeLicitacion = (codigo: string): string =>
  `Esta cotización es lo postulado en la licitación ${codigo}: se cambia solo desde Oportunidades, con «Armar postulación».`;
