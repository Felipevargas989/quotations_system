# 14 · Cuotas que se llenan (regla nueva del plan de pagos)

> **Estado: PLAN APROBADO EN SUS REGLAS, SIN CONSTRUIR** (07-10-2026).
> Reemplaza la regla 2 ("cuadratura de la cuota", 20-07) y la regla 16
> ("si baja el total, desde la última") del mapa
> `mapa/03_PAGOS_REEMBOLSOS_Y_PORTAL.md`. Cuando se construya, el mapa 03
> se actualiza en el mismo commit y este documento pasa a "construido".

## Por qué

Felipe, 07-10-2026, sobre la cotización 506 (Manantial de vida): *"ajusté
la cantidad de personas y el calendario de pagos se volvió loco"*. Medido:
una cuota de $1.125.000 quedó partida en tres filas ($195.000 pagada,
$795.000 pagada, $135.000 vencida) por dos abonos parciales, y al bajar las
personas la última cuota quedó en **$0**. Todo cuadraba al peso, pero el
calendario dejó de parecerse al plan que se acordó con el cliente.

*"¿No será más simple que las cuotas queden estáticas y que se vaya
rellenando la cuota a medida que se van pagando, y que si bajo la cantidad
de personas se reduzcan los saldos de todas las cuotas pendientes? Creo que
la regla es la que está mal."*

## Las reglas (aprobadas por Felipe, 07-10-2026)

1. **El plan es fijo.** Cada cuota conserva su monto y su fecha; un abono
   nunca la divide.
2. **Los abonos llenan en orden.** Un abono entra en la cuota más antigua
   con saldo y lo que sobra pasa a la siguiente (el derrame de hoy). Una
   cuota a medio pagar se muestra **"Parcial: $X de $Y"**.
3. **Estado**: pagada si lo abonado cubre el monto; si no, vencida (su
   fecha ya pasó) o pendiente. "Parcial" es una etiqueta de pantalla, no un
   estado nuevo de la base: en la base sigue siendo `pendiente` o
   `vencido`. **No hay migración de esquema.**
4. **Si el total BAJA**, la rebaja se reparte entre **todas** las cuotas
   no pagadas (vencidas incluidas: favorece al cliente), **en proporción a
   su saldo** (lo que les falta). Lo abonado nunca se toca. Si la rebaja
   supera todo el saldo, lo que sobra es reembolso (como hoy).
5. **Si el total SUBE**, primero se consumen los reembolsos pendientes
   (regla 15 de hoy, sin cambio). El resto se reparte **en proporción a su
   saldo entre las cuotas no pagadas que todavía no vencen** (opción B de
   Felipe: *"las modificaciones de cantidad de personas ya son más
   cercanas al evento"*; una cuota vencida no amanece debiendo más). Si no
   queda ninguna sin vencer, nace una cuota nueva, como hoy.
6. **Nunca una cuota en $0.** Una cuota sin abonos que se queda sin saldo
   se borra y las siguientes corren su número. Una con abonos queda
   `pagado` con `amount = abonado`.
7. **Redondeo**: al peso; lo que sobre del reparto va a la última cuota
   que participa.

## Casos borde

| Caso | Qué pasa |
|---|---|
| Abono menor que la cuota | Cuota "Parcial", sin partirse |
| Abono mayor que la cuota | Completa esa y derrama a la siguiente (una transacción por cuota, como hoy) |
| Abono mayor que todo el saldo | Se bloquea (como hoy) |
| Cuota parcial y SUBEN las personas | Si no ha vencido, sube en proporción a lo que le falta; si ya venció, no sube |
| Cuota parcial y BAJAN las personas | Baja en proporción a lo que le falta; nunca por debajo de lo abonado |
| La rebaja iguala todo el saldo | Las parciales quedan pagadas por lo abonado; las sin abonos desaparecen |
| La rebaja supera todo el saldo | Lo anterior + el exceso como reembolso |
| Corregir un abono (lápiz) | Su cuota recalcula su estado; para un monto mayor que el saldo de la cuota se borra y se registra de nuevo (como hoy) |
| Borrar un abono | Su cuota recalcula su estado. Los abonos NO se mueven entre cuotas: si queda un hueco en una cuota anterior, el próximo pago lo llena primero (regla 2) |
| Comprobante del portal confirmado | Entra por la misma puerta que un pago registrado a mano |
| Cambiar el monto de una cuota a mano | Hoy no se puede (Nivel A: solo fecha y nota sin plata). Sin cambio |
| Recordatorios y vencidas | Cobran el **saldo** de la cuota, no su monto |

## Qué hay que tocar (medido en el código y el grafo, 07-10-2026)

`graphify affected normalizePaymentAfterTransactions` → la llaman
`createOverflowPaymentTransaction`, `createOrUpdatePaymentTransaction`,
`removePaymentTransaction`, `createPaymentTransaction` (portal) y
`updatePaymentTransaction`. Lectores del monto o el estado de las cuotas,
buscados en el código:

| Pieza | Archivo | Qué cambia |
|---|---|---|
| Cuadratura de la cuota | `payments/payments.service.ts` `normalizePaymentAfterTransactions` | Deja de dividir: solo fija el estado (pagado si cubre; si no, pendiente o vencido según fecha) |
| Cascada del total | `quotations/quotations.service.ts` `update` | Reparto proporcional (reglas 4 a 7) en vez de "desde la última"; borra cuotas que quedan en $0 sin abonos |
| Recordatorios | `payments/payments-cron.service.ts` | El correo dice el saldo, no el monto |
| Ficha 360° del cliente | `clients/clients.repository.ts` `findSummary` | Hoy suma el monto completo de las cuotas pendientes ("solo cuadra gracias a la regla de cuadratura"): debe restar lo abonado |
| Panel de caja | `analytics/analytics.service.ts` | Lo abonado de una cuota parcial cuenta como cobrado en el mes del abono (hoy solo cuenta si la cuota está pagada; el saldo ya se resta bien) |
| Fila HOY y app móvil | `analytics/hoy.controller.ts`, `movil/movil.service.ts` | Ya restan abonos: solo verificar |
| Post-Venta | `frontend/src/pages/postventa/PostVentaPage.tsx` (gigante congelado: la pieza va en archivo propio) | Etiqueta "Parcial $X de $Y" y saldo por cuota; la vista previa del derrame ya usa `amount - paid_amount` |
| Portal del cliente | `quotations/quotations.service.ts` `getPortalData`, `frontend/src/pages/portal/PortalPage.tsx` | Mostrar abonado y saldo por cuota; `submitPortalReceipt` ya topa con lo pendiente |
| Aviso ámbar | `frontend/src/components/AvisoPlanDePagos.tsx` | Texto nuevo: "se reparte entre las cuotas pendientes" |
| Pruebas | `payments.service.spec.ts`, `quotations.service.spec.ts` | Hoy prueban la división y "agranda la última": se reescriben para la regla nueva + los casos borde de arriba |

Lo que NO cambia: el portero del plan (suma al peso), el derrame, el
candado del evento realizado, la guardia de estados, los reembolsos y la
compensación, los hitos anti-spam, el Nivel A del calendario.

## Datos existentes (decisión de Felipe, 07-10-2026)

Medido en producción: **10 cotizaciones** tienen cuotas partidas por la
regla vieja (465, 490, 506, 520, 552 aceptadas; 148, 332, 449, 486, 499
realizadas) y **2 cuotas en $0** (506 cuota 6 pendiente; 494 cuota 2
vencida, sin abonos). Felipe: *"solamente actualicemos la 506, el resto
dejemos como está"*. La 506 se junta a mano, mostrándole antes el
resultado:

| Hoy | Después |
|---|---|
| 1 · $195.000 pagado · 2 · $795.000 pagado · 3 · $135.000 vencido | 1 · $1.125.000 · Parcial $990.000 · vencida |
| 4 · $3.375.000 pendiente | 2 · $3.375.000 pendiente |
| 5 · $2.056.100 pendiente | 3 · $2.056.100 pendiente |
| 6 · $0 pendiente | (se borra) |

Los dos abonos ($195.000 del 06-10 y $795.000 del 07-10) pasan a colgar de
la cuota 1, con sus comprobantes y notas intactos.

## Orden de construcción

1. **Sprint 1, motor**: reglas 1 a 7, cron, ficha 360°, panel de caja, pruebas. En el laboratorio.
2. **Sprint 2, pantallas**: Post-Venta, portal, aviso ámbar. En el laboratorio.
3. Felipe valida → producción → arreglo de la 506.
