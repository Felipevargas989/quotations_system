# 14 · Cuotas que se llenan: el plan mantiene su forma

> **Estado: CONSTRUIDO EN LA RAMA `pruebas`** (08-10-2026), sin publicar
> en producción. Migración 118 aplicada en el LABORATORIO; en producción
> va ANTES del deploy del motor. Falta la validación de Felipe en el
> laboratorio y, después, revisar una a una las cotizaciones viejas con
> cuotas partidas.
>
> Reemplaza la regla 2 ("cuadratura de la cuota", 20-07), las reglas 5 y
> 6 (rectificar no derrama; borrar no toca otras cuotas) y la regla 16
> ("si baja el total, desde la última") del mapa
> `mapa/03_PAGOS_REEMBOLSOS_Y_PORTAL.md`.

## Por qué

**07-10-2026, cotización 506 (Manantial de vida).** Felipe: *"ajusté la
cantidad de personas y el calendario de pagos se volvió loco"*. Medido:
una cuota de $1.125.000 quedó partida en tres filas por dos abonos
parciales, y al bajar las personas la última cuota quedó en **$0**.
Felipe: *"¿no será más simple que las cuotas queden estáticas y que se
vaya rellenando la cuota a medida que se van pagando…? Creo que la regla
es la que está mal."*

**Primer intento (07-10, laboratorio): repartir "según lo que le falta a
cada cuota".** Lo probó con Linde (cotización 456 del laboratorio): 4
cuotas de $1.590.750, abono de $1.000.000, el total baja a $3.801.000.
Quedó 1.308.539 / 830.821 / 830.820 / 830.820. Felipe: *"no me cuadra…
debieron quedar todas 950.250 y quedar totalmente pagada la primera y
parcialmente la segunda"*. De ahí la regla definitiva: **el plan mantiene
su forma.**

## La regla (aprobada por Felipe, 07/08-10-2026)

1. **Lo pagado llena las cuotas desde la primera.** Qué cuotas están
   pagadas depende SOLO de cuánto se ha pagado en total, no del orden de
   los pagos ni de a qué cuota se registraron.
2. **Si cambia el total, las cuotas cambian en proporción a su monto**:
   si eran iguales, siguen iguales.
   - **Baja** → todas las cuotas, también las pagadas ("forma completa").
     Lo que una cuota pagada deja de necesitar pasa a la siguiente.
   - **Sube** → solo las cuotas por pagar que **no han vencido**
     (opción B: lo nuevo nunca nace vencido; los cambios de personas
     llegan cerca del evento). Sin ninguna, nace una cuota nueva.
3. **Después de cualquier cambio, lo pagado se vuelve a repartir desde la
   primera.**

Como todo se recalcula desde cero, la regla **se corrige sola**: si algo
queda a medias (dos personas a la vez, un corte), el siguiente cambio lo
deja cuadrado.

## Los casos borde (aprobados por Felipe, 08-10-2026)

| # | Caso | Cómo queda |
|---|---|---|
| | **Baja el total** | |
| 1 | Hay una cuota a medio pagar (Linde) | Todas bajan parejo ($950.250 c/u); la 1 queda pagada y la 2 con $49.750 |
| 2 | Hay cuotas ya pagadas | También bajan ("forma completa") y lo que les sobra pasa a la siguiente |
| 3 | Hay cuotas vencidas | También bajan: favorece al cliente |
| 4 | Baja por debajo de lo ya pagado | Todas quedan pagadas y la diferencia es reembolso. Nunca queda una cuota en $0 |
| | **Sube el total** | |
| 5 | Regla general | Crecen solo las cuotas por pagar que no han vencido, parejas entre ellas (opción B) |
| 6 | Ya no queda ninguna cuota que venga | Nace una cuota nueva; vence 7 días después del evento (como siempre) |
| 7 | Hay un reembolso pendiente | Primero se descuenta del reembolso (tarea #42) |
| 8 | Una cuota pagada | Nunca vuelve a deber |
| 9 | Baja de lo pagado y después vuelve a subir | El plan no recupera su forma: la subida va a una cuota nueva |
| | **Pagos** | |
| 10 | Registrar un pago | Llena desde la primera cuota y lo que sobra pasa a la siguiente, sin importar la fecha del pago |
| 11 | Un pago queda repartido en dos cuotas | Se ve, se corrige y se borra como uno solo (migración 118: `pago_grupo`) |
| 12 | Borrar un pago | Se reparte de nuevo desde la primera: se abre la ÚLTIMA cuota que estaba cubierta |
| 13 | Corregir un pago a un monto mayor | Se reparte solo; ya no hay que borrarlo y registrarlo de nuevo. Tope: lo que falta pagar del evento |
| | **Fechas, cobranza y portal** | |
| 14 | Una cuota que vence hoy | Sigue pendiente hasta la medianoche de Chile (ver "El reloj de la noche") |
| 15 | Correos de cobro | Cobran siempre lo que falta (el saldo). Una cuota que se reabre queda en rojo, sin correo extra (salen solo en 3 fechas fijas) |
| 16 | "Ya transferí" en el portal | El cliente paga la próxima cuota, hasta el saldo del evento; al confirmarlo, se reparte desde la primera aunque el plan haya cambiado |
| | **Otros** | |
| 17 | Redondeo | Lo que sobra al repartir va a la primera cuota (igual que el editor del plan, `repartirEnCuotas`) |
| 18 | Reembolso ya devuelto | No se cuenta como pagado: la rebaja solo descuenta lo que cabe en el saldo |
| 19 | Dos personas a la vez, o un corte a la mitad | El siguiente guardado lo deja cuadrado |
| 20 | Cotizaciones viejas con cuotas partidas | Funcionan, pero se ven partidas hasta revisarlas una a una |

**Caso extra, medido al construir (08-10-2026): cuotas "pagadas por
fuera".** 40 cuotas están marcadas pagadas con una fecha de pago escrita
por una carga de datos (`paid_date`, que Eventia nunca escribe) y
**ningún pago registrado**. **Ninguna es de Valle del Sol**: todas son
de la empresa 52, *Vivo Corriendo SpA* (9 en cotizaciones aceptadas, 29
realizadas, 2 canceladas; clientes de ejemplo como "Forestal Nahuel" o
"Banco del Sur"), igual en producción que en el laboratorio. Recalcular
desde los pagos las habría reabierto. La regla las reconoce (pagada +
`paid_date` + sin registros) y **no las toca nunca**: no se escalan, no
reciben pagos y su monto no entra en lo que se reparte. Para Valle del
Sol no se activa nunca (Felipe, 08-10: en el laboratorio "puede no tener
mucho sentido").

## El reloj de la noche (error encontrado el 07-10-2026)

`updateOverduePayments` corría a la 1 AM del servidor (UTC = **22:00 en
Chile**) y marcaba vencida toda cuota con `due_date <= ahora (UTC)`: la
noche ANTES de su vencimiento. Medido: la cuota 2 de la **552** (vence
07-10) quedó vencida el 06-10 a las 22:00, y por eso su correo de "vence
hoy" (que busca cuotas `pendiente`) no pudo salir. Arreglo: corre a las
**00:05 de Chile** (`@Cron('5 0 * * *', { timeZone: 'America/Santiago' })`)
y marca solo `due_date < hoy en Chile`. El mismo criterio (`hoyEnChile`)
usan el llenado, el calendario de la cuota y el reparto.

## Cómo está construido

| Pieza | Archivo | Qué hace |
|---|---|---|
| La regla, pura | `api-rest/src/payments/cuotas-que-se-llenan.ts` | `repartirRebaja` (forma completa), `repartirAlza` (opción B), `planDeLlenado` (vuelve a repartir los pagos desde la primera, reutilizando las piezas), `escalarEnProporcion` (resto a la primera), `hoyEnChile`, `estaVencida` |
| El servicio | `api-rest/src/payments/payments.service.ts` | `leerPlan`, `aplicarLlenado`, `rellenarCuotas`, `cambiarTotalDelPlan`; registrar (`createOverflowPaymentTransaction`: una pieza con `pago_grupo` nuevo + llenado), corregir (`updatePaymentTransaction`: el pago entero) y borrar (`removePaymentTransaction`: todas las piezas del grupo). `normalizePaymentAfterTransactions` ya no existe |
| La cascada | `api-rest/src/quotations/quotations.service.ts` `update` | Llama `cambiarTotalDelPlan`; el reembolso y la cuota nueva se resuelven como siempre |
| El portal | `quotations.service.ts` `submitPortalReceipt`, `portal-receipts.controller.ts` `confirm`, `PortalPage.tsx` | Tope = saldo del evento; confirmar entra por el derrame y ya no exige que la cuota siga existiendo; el botón solo en la próxima cuota |
| Base | `docs/migrations/118_un_pago_repartido_en_cuotas_es_uno_solo.sql` | `payment_transactions.pago_grupo` (uuid, default `gen_random_uuid()`, segura antes del deploy) |
| Post-Venta | `PostVentaPage.tsx`, `pagoRepartido.ts`, `estadoCuota.tsx` | Rectificar abre el pago entero; borrar avisa "está repartido en N cuotas y se elimina entero"; etiqueta "· parcial" |
| Lo que ya funcionaba | ficha 360°, panel de caja, fila HOY, app móvil, correos | Leen lo abonado por cuota desde los registros: el llenado les deja los registros donde corresponde |
| Pruebas | `payments/tests/cuotas-que-se-llenan.spec.ts` (21, los casos borde), `cuotas-que-se-llenan.servicio.spec.ts` (10, de punta a punta con base simulada), `frontend/.../pagoRepartido.test.ts` (4) | |

## Datos existentes (decisión de Felipe, 07-10-2026)

Medido en producción: **10 cotizaciones** tienen cuotas partidas por la
regla vieja (465, 490, 506, 520, 552 aceptadas; 148, 332, 449, 486, 499
realizadas) y **2 cuotas en $0** (506 cuota 6 pendiente; 494 cuota 2
vencida, sin abonos). Felipe: *"primero hagamos el cambio y luego
revisamos las cotizaciones una a una"*. La 506 quedaría:

| Hoy | Después |
|---|---|
| 1 · $195.000 pagado · 2 · $795.000 pagado · 3 · $135.000 vencido | 1 · $1.125.000 · parcial $990.000 |
| 4 · $3.375.000 pendiente | 2 · $3.375.000 pendiente |
| 5 · $2.056.100 pendiente | 3 · $2.056.100 pendiente |
| 6 · $0 pendiente | (se borra) |

## Orden de construcción

1. ~~Sprint 1, motor (primer intento, "según lo que falta")~~ — 07-10,
   reemplazado.
2. **Regla definitiva** — HECHA en `pruebas` el 08-10-2026: motor,
   migración 118 (lab), Post-Venta, portal y aviso ámbar.
3. Felipe valida en el laboratorio → migración 118 en producción →
   producción → revisión una a una (partiendo por la 506).
