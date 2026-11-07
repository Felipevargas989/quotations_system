import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { textoLimpio } from '../archivo/texto';
import type { LineaDeDetalle } from '../archivo/tipos';
import type { BoletaSueltaDto } from './boleta.dto';
import { glosaDeLaBoleta } from './reparto';

/**
 * LA BOLETA SUELTA (doc 19 §9.4, §9.16 y §9.22): sus líneas, las mismas para
 * la vista previa y para emitirla (así lo que se ve es lo que sale). Puro:
 * no lee la base.
 *
 * - Cada ítem del tarifario (activo, de la empresa) por su cantidad, con la
 *   cantidad en la descripción larga («2 noches»).
 * - La línea a mano, solo del administrador (D3: los precios nunca a dedo).
 * - La cabaña al comienzo de la descripción de cada línea (`glosaDeLaBoleta`,
 *   como «Por boletear»): el PDF de la boleta no imprime las observaciones
 *   (paso 0, 06-11; Felipe: «si ponlo en la descripción»).
 */

/** «2 noches», «3 personas»: la cantidad en la descripción de la línea. */
const PLURAL: Record<string, string> = {
  noche: 'noches',
  persona: 'personas',
  día: 'días',
  hora: 'horas',
  unidad: 'unidades',
};

/** El correo del huésped, en minúscula; vacío, nada. */
export const correoLimpio = (c: string | null | undefined) =>
  (c ?? '').trim().toLowerCase() || null;

interface ItemDelTarifario {
  id: number;
  nombre: string;
  precio: number;
  unidad: string;
  activo: boolean;
}

export const lineasDeLaSuelta = (
  tarifario: ItemDelTarifario[],
  dto: BoletaSueltaDto,
  esAdministrador: boolean,
) => {
  const lineas: LineaDeDetalle[] = dto.lineas.map((l) => {
    if (l.tarifario_id != null) {
      const item = tarifario.find((t) => t.id === l.tarifario_id);
      if (!item || !item.activo)
        throw new BadRequestException(
          'Ese ítem del tarifario no existe o está desactivado',
        );
      const cantidad = l.cantidad ?? 1;
      return {
        descripcion: item.nombre,
        cantidad,
        precio: item.precio,
        descripcionLarga:
          cantidad > 1 && item.unidad !== 'unidad'
            ? `${cantidad} ${PLURAL[item.unidad] ?? item.unidad}`
            : null,
      };
    }
    if (!esAdministrador)
      throw new ForbiddenException(
        'Escribir un monto a mano es solo del administrador: elige del tarifario',
      );
    const descripcion = textoLimpio(l.descripcion);
    if (!descripcion || !l.monto)
      throw new BadRequestException(
        'La línea a mano necesita qué se cobra y su monto',
      );
    return { descripcion, cantidad: 1, precio: l.monto };
  });
  const cabana = textoLimpio(dto.cabana) || null;
  return {
    lineas: cabana
      ? lineas.map((l) => ({
          ...l,
          descripcion: glosaDeLaBoleta(l, { cabana }),
        }))
      : lineas,
    cabana,
    correo: correoLimpio(dto.correo),
  };
};
