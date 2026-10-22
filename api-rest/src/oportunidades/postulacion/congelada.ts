import { BadRequestException } from '@nestjs/common';

// AL POSTULAR, LA OFERTA SE CONGELA (decisión 33 del doc 17, 19-10).
// Felipe: "si una oferta es aceptada en Mercado Público ya no se modifica:
// se debe cumplir el contrato tal cual se postuló". Desde «Postulada», lo
// postulado (la oferta, su cotización y los documentos) queda fijo tal como
// se subió; si sale «Ganada», es el contrato.

const CONGELADOS: readonly string[] = ['postulada', 'ganada'];

export const estaCongelada = (estado: string | null | undefined): boolean =>
  CONGELADOS.includes(estado ?? '');

export const porQueEstaCongelada = (estado: string | null | undefined) =>
  estado === 'ganada'
    ? 'La ganaste: lo postulado es el contrato y no se modifica.'
    : 'Ya la postulaste: lo postulado queda fijo, tal como se subió a Mercado Público.';

/** Corta cualquier cambio a lo postulado de una licitación ya postulada. */
export const noSiEstaCongelada = (estado: string | null | undefined): void => {
  if (estaCongelada(estado)) {
    throw new BadRequestException(porQueEstaCongelada(estado));
  }
};
