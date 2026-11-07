import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ItemDelTarifario } from '../boletas/suelta';
import type { LineaPedida } from './borrador';

/**
 * LA FACTURA CON EL TARIFARIO (doc 19 §9.23, 07-11-2026).
 *
 * Felipe: *"el recepcionista solamente puede emitir boletas y facturas de
 * cabañas según el tarifario"*. Como en la boleta suelta (`suelta.ts`):
 * - la línea elegida del tarifario (activo, de la empresa) lleva su nombre
 *   y su precio con IVA de ahí; la persona pone la cantidad y, si quiere,
 *   la descripción larga (no cambia el precio);
 * - la línea a mano y el descuento son del administrador (D3: los precios
 *   nunca a dedo).
 * Puro: no lee la base. Lo usan la vista previa y la emisión, así lo que se
 * ve es lo que sale.
 */
export const conElTarifario = (
  lineas: LineaPedida[],
  tarifario: ItemDelTarifario[],
  esAdministrador: boolean,
): LineaPedida[] =>
  lineas.map((l) => {
    const conDescuento = Number(l.descuento) > 0;
    if (l.tarifario_id != null) {
      const item = tarifario.find((t) => t.id === l.tarifario_id);
      if (!item || !item.activo)
        throw new BadRequestException(
          'Ese ítem del tarifario no existe o está desactivado',
        );
      if (conDescuento && !esAdministrador)
        throw new ForbiddenException(
          'El descuento es solo del administrador: va el precio del tarifario',
        );
      return { ...l, descripcion: item.nombre, precio: item.precio };
    }
    if (!esAdministrador)
      throw new ForbiddenException(
        'Escribir una línea a mano es solo del administrador: elige del tarifario',
      );
    return l;
  });

/** ¿Alguna línea viene del tarifario? Sin ninguna, no hace falta leerlo. */
export const usaElTarifario = (lineas: LineaPedida[]) =>
  lineas.some((l) => l.tarifario_id != null);
