import { tieneDerecho } from 'src/auth/derechos';
import type { User } from 'src/users/entities/user.entity';
import { buscarClientes } from './buscar-clientes';
import { buscarCotizaciones } from './buscar-cotizaciones';
import { buscarEnCatalogo } from './buscar-en-catalogo';
import { calendario } from './calendario';
import type { Herramienta } from './comun';
import { seguimientosPendientes } from './seguimientos-pendientes';
import { verCotizacion } from './ver-cotizacion';

// LA LISTA CERRADA (doc 20 §3, regla 2). Lo que no está acá, Evia no lo
// puede hacer: no hay herramienta que escriba, que borre, que mande un
// correo ni que toque pagos. Fase 1, sprint 1: solo consultas de quien
// vende. Los pagos, las compras, los proveedores, el mobiliario y el
// personal llegan en el sprint 3, cada uno con el cargo de su pantalla.
export const HERRAMIENTAS: readonly Herramienta[] = [
  buscarCotizaciones,
  verCotizacion,
  calendario,
  seguimientosPendientes,
  buscarEnCatalogo,
  buscarClientes,
];

/** Las que puede usar esta persona: su cargo las ve en pantalla y su
 *  empresa tiene el derecho. A la IA solo se le ofrecen esas. */
export const herramientasPara = (usuario: User): Herramienta[] =>
  HERRAMIENTAS.filter(
    (h) =>
      h.cargos.includes(usuario.role) &&
      (!h.derecho || tieneDerecho(usuario.derechos, h.derecho)),
  );
