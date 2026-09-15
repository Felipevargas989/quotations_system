import { SetMetadata } from '@nestjs/common';
import type { Derecho as NombreDeDerecho } from './derechos';

// DERECHOS POR PLAN (14-09-2026, paso 3.2 del roadmap de venta).
//
// Nació el 14-09 como @ModuloPropio, para dejar Personal y Marketing solo
// en Valle del Sol. Es el mismo mecanismo, ahora con todos los derechos:
// Personal y Marketing pasaron a ser dos derechos más. Lo que cambia es el
// nombre; el comportamiento es idéntico.
//
// Un controller marcado con @Derecho('calendario') exige ese derecho en
// TODAS sus rutas. Una ruta marcada con @Derecho(null) se abre aunque el
// controller esté cerrado — así Post-Venta sigue usando las sillas de
// Personal, y el cotizador el catálogo de Logística, sin tener el módulo.
//
// Lo que NO se marca acá: todo lo compartido. La lista de cotizaciones la
// usan el cotizador (Cotiza), el Calendario (Gestiona) y el Dashboard: esa
// puerta queda abierta y lo que se cierra es la función que la usa. Es la
// razón de que las 79 rutas conflictivas del inventario no sean problema.
export const DERECHO_KEY = 'derecho';
export const Derecho = (derecho: NombreDeDerecho | null) =>
  SetMetadata(DERECHO_KEY, derecho);

// UNA EMPRESA BLOQUEADA (se le acabó la prueba y no pagó) no entra a
// ninguna parte, salvo lo justo para poder pagar: su sesión, su perfil, su
// empresa y la pantalla de Planes. Esas pocas rutas se marcan con
// @SinPlan(). Todo lo demás le responde 403 con codigo PLAN_BLOQUEADO.
export const SIN_PLAN_KEY = 'sinPlan';
export const SinPlan = () => SetMetadata(SIN_PLAN_KEY, true);
