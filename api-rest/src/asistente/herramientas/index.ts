import { tieneDerecho } from 'src/auth/derechos';
import type { User } from 'src/users/entities/user.entity';
import { buscarClientes } from './buscar-clientes';
import { buscarCotizaciones } from './buscar-cotizaciones';
import { buscarEnCatalogo } from './buscar-en-catalogo';
import { calendario } from './calendario';
import type { Herramienta } from './comun';
import { insumos, mobiliario, proveedores } from './logistica';
import { cobranza, pagosDelEvento } from './pagos';
import { personal } from './personal';
import { seguimientosPendientes } from './seguimientos-pendientes';
import { verCotizacion } from './ver-cotizacion';

// LA LISTA CERRADA (doc 20 §3, regla 2). Lo que no está acá, BelIA no lo
// puede hacer: no hay herramienta que escriba, que borre, que mande un
// correo ni que toque pagos. Fase 1: solo consultas, cada una con el cargo
// de su pantalla: las de quien vende (sprint 1) y los pagos, la logística y
// el personal (sprint 3, 03-11).
export const HERRAMIENTAS: readonly Herramienta[] = [
  buscarCotizaciones,
  verCotizacion,
  calendario,
  seguimientosPendientes,
  buscarEnCatalogo,
  buscarClientes,
  pagosDelEvento,
  cobranza,
  insumos,
  proveedores,
  mobiliario,
  personal,
];

/** Las que puede usar esta persona: su cargo las ve en pantalla y su
 *  empresa tiene el derecho. A la IA solo se le ofrecen esas. */
export const herramientasPara = (usuario: User): Herramienta[] =>
  HERRAMIENTAS.filter(
    (h) =>
      h.cargos.includes(usuario.role) &&
      (!h.derecho || tieneDerecho(usuario.derechos, h.derecho)),
  );
