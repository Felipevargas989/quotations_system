import { tieneDerecho } from 'src/auth/derechos';
import { pasa, permisosDelCargo } from 'src/auth/permisos';
import type { User } from 'src/users/entities/user.entity';
import { avisosDeHoy } from './avisos';
import { buscarClientes } from './buscar-clientes';
import { buscarCotizaciones } from './buscar-cotizaciones';
import { buscarEnCatalogo } from './buscar-en-catalogo';
import { calendario } from './calendario';
import { loQueHayQueComprar } from './compras';
import type { Herramienta } from './comun';
import {
  lecciones,
  proponerDecisionDeLeccion,
  proponerLeccion,
} from './lecciones';
import { insumos, mobiliario, proveedores } from './logistica';
import { proponerCambioDeCliente } from './mal-clasificados';
import { cobranza, pagosDelEvento } from './pagos';
import { personal } from './personal';
import {
  proponerCambioDeServicios,
  proponerCotizacionNueva,
  proponerNota,
  proponerSeguimiento,
} from './proponer';
import { seguimientosPendientes } from './seguimientos-pendientes';
import { verCotizacion } from './ver-cotizacion';

// LA LISTA CERRADA (doc 20 §3, regla 2). Lo que no está acá, BelIA no lo
// puede hacer: no hay herramienta que escriba, que borre, que mande un
// correo ni que toque pagos. Fase 1: las consultas, cada una con el cargo
// de su pantalla: las de quien vende (sprint 1) y los pagos, la logística y
// el personal (sprint 3, 03-11), con lo que hay que comprar. Fase 2 (03-11):
// las dos que PROPONEN y no escriben; la persona aprueba (regla 3).
export const HERRAMIENTAS: readonly Herramienta[] = [
  buscarCotizaciones,
  verCotizacion,
  calendario,
  seguimientosPendientes,
  avisosDeHoy,
  buscarEnCatalogo,
  buscarClientes,
  pagosDelEvento,
  cobranza,
  insumos,
  loQueHayQueComprar,
  proveedores,
  mobiliario,
  personal,
  proponerCambioDeServicios,
  proponerNota,
  proponerCotizacionNueva,
  // Doc 20 §17: el borrador del seguimiento, con su tarjeta, y lo que
  // aprende de las correcciones.
  proponerSeguimiento,
  lecciones,
  proponerLeccion,
  proponerDecisionDeLeccion,
  // Doc 21 §6: corregir un cliente mal clasificado, con su tarjeta.
  proponerCambioDeCliente,
];

/** Las que puede usar esta persona: su cargo las ve en pantalla (con los
 *  permisos por cargo de su empresa, doc 22) y su empresa tiene el
 *  derecho. A la IA solo se le ofrecen esas. */
export const herramientasPara = (usuario: User): Herramienta[] => {
  const prendidos = usuario.permisos ?? permisosDelCargo(usuario.role);
  return HERRAMIENTAS.filter(
    (h) =>
      pasa(usuario.role, prendidos, {
        roles: h.cargos,
        permiso: h.permiso,
        dentroDe: h.dentroDe,
      }) &&
      (!h.derecho || tieneDerecho(usuario.derechos, h.derecho)),
  );
};
