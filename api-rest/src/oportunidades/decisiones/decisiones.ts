// EL REGISTRO DE LAS DECISIONES (decisión 113 del doc 17): el ciclo de
// aprendizaje del semáforo. Felipe: «vayamos dejando registro de todas las
// licitaciones que he ido descartando, de todas las que me interesa y saco
// las bases y de todas las que he postulado para identificar patrones y
// poder afinar el semáforo».
//
// Cada decisión la anotan dos triggers de la base (migración 175), con el
// color y la razón de la IA de ese momento. El motor solo pone el porqué de
// un descarte: llega con el mismo cambio de estado (`PATCH :id` con
// `motivo`), elegido en el modal que se abre al descartar.

/** El porqué de un descarte. */
export const MOTIVOS_DEL_DESCARTE = [
  'muy_chica',
  'muy_lejos',
  'no_es_lo_mio',
  'no_alcanzo',
  'otro',
] as const;

export type MotivoDelDescarte = (typeof MOTIVOS_DEL_DESCARTE)[number];
