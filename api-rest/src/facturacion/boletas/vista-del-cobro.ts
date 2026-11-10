import type { CobroGuardado } from './boletas.repository';
import { repartoDelCobro } from './reparto';

/** El cobro como lo ve la pantalla. */
export const vista = (c: CobroGuardado) => ({
  id: c.id,
  quotation_id: c.quotation_id,
  numero: c.cotizacion?.quotation_number ?? null,
  descripcion: c.descripcion,
  total: c.total,
  creado_por_nombre: c.creado_por_nombre,
  created_at: c.created_at,
  lineas: c.lineas.map((l) => ({
    id: l.id,
    cabana: l.cabana,
    monto: l.monto,
    correo: l.correo,
    folio: l.documento?.folio ?? null,
    estado: l.documento?.estado ?? null,
    pdf_path: l.documento?.pdf_path ?? null,
  })),
  cambios: c.cambios.map((x) => ({
    que: x.que,
    antes: x.antes,
    despues: x.despues,
    nombre: x.nombre,
    created_at: x.created_at,
    // La cabaña del cambio, si sigue en el reparto («El monto de Cabaña 5»).
    cabana:
      x.linea_id != null
        ? (c.lineas.find((l) => l.id === x.linea_id)?.cabana ?? null)
        : null,
  })),
  ...repartoDelCobro(c),
});
