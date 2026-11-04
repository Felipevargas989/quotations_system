// EL PUESTO VACÍO VALE LO QUE VALE SU CARGO (Felipe, 04-11-2026, con la
// 522): en Gestión «estamos solamente planificando y aún no tiene nombre,
// nada: debe sumar el total y multiplicarlo por el valor de cada uno».
//
// El valor vive en cada silla (doc 10, 17-08: un cargo no lleva precio),
// y la grilla muestra como «Valor c/u» el de cualquier silla del cargo.
// Pero una silla puesta ANTES de que el cargo tuviera valor nacía sin
// monto y se quedaba así: el valor llegó después por otra puerta (el
// monto de la persona en Planificación) y la grilla lo mostraba prestado
// mientras el subtotal, el margen y el Dashboard sumaban esas sillas en
// $0. La 522 marcaba $287.000 donde iban $571.000.
//
// Regla: una silla vacía sin monto toma el valor de su cargo en ese
// evento. Al nacer, si el cargo ya tiene valor; y cuando el cargo recibe
// valor, las que estaban sin monto lo toman. Solo las SIN monto: un
// estimado ya escrito no se pisa, y una persona con nombre conserva lo
// acordado. La planta no da valor: su monto en un evento es la
// asignación extra de la ficha, no el precio de un cargo.

type FilaConValor = {
  quotation_id?: string | null;
  role_id?: number | null;
  kind?: string | null;
  amount?: number | string | null;
};

/** El valor con que nace una silla vacía: el que trae o, si no, el que
 *  ya tiene su cargo en el evento. */
export async function valorDeLaSillaNueva(
  repo: {
    valorDelCargo: (
      companyId: number,
      quotationId: string,
      roleId: number,
    ) => Promise<number | null>;
  },
  companyId: number,
  dto: FilaConValor,
): Promise<number | null> {
  if (dto.amount != null) return Number(dto.amount);
  if (!dto.quotation_id || dto.role_id == null) return null;
  return repo.valorDelCargo(companyId, dto.quotation_id, dto.role_id);
}

/** ¿Esta fila le da valor a su cargo en el evento? */
export const daValorAlCargo = (f: FilaConValor | null | undefined): boolean =>
  !!f?.quotation_id &&
  f.role_id != null &&
  f.kind !== 'planta' &&
  Number(f.amount ?? 0) > 0;

/** Después de escribir una fila: si le dio valor a su cargo, las sillas
 *  vacías sin monto de ese cargo y evento lo toman. Devuelve la misma
 *  fila, para encadenarlo al `return` de quien escribe. */
export async function valorizarVacias<T extends FilaConValor>(
  repo: {
    valorizarVaciasSinMonto: (
      companyId: number,
      quotationId: string,
      roleId: number,
      amount: number,
    ) => Promise<unknown>;
  },
  companyId: number,
  fila: T,
): Promise<T> {
  if (daValorAlCargo(fila)) {
    await repo.valorizarVaciasSinMonto(
      companyId,
      fila.quotation_id as string,
      fila.role_id as number,
      Number(fila.amount),
    );
  }
  return fila;
}
