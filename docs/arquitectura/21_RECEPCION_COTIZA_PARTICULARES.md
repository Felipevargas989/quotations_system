# 21 · Recepción cotiza a los particulares

> **Estado: PLAN del 04-11-2026 en la noche.** Felipe lo aprobó ese día
> (*"perfecto todas tus indicaciones"*). Va al laboratorio por tandas; a
> producción, solo con su «a producción». Migración reservada: **186**
> (con Facturación, que tiene la 184), aplicada en el laboratorio. Las
> tandas R1 (el motor) y R2 (la pantalla) escritas esa noche en la rama
> `feature/recepcion-particulares`.

## 1. Lo que pidió Felipe

*"Creo que recepción podría ver la parte de cotizaciones de personas
naturales... mostrar los precios... liberar la parte de cotizaciones como
completa pero solo personas naturales."*

Y al revisar el plan, el mismo día:
- *"debería poder crear, editar y enviar... cargar los seguimientos, hacer
  seguimiento, anotar los seguimientos"*;
- *"el aceptar ya no... el plan de pago, eso es otra cosa"*: aceptar y cobrar
  quedan para operaciones;
- *"recepción no puede dar descuento"*;
- *"Belia sí le puede dar con montos para recepción, pero solo de
  cotizaciones para particulares... hoy en día ella ve los correos, ve los
  montos, sabe cuánto cobramos"*;
- *"Club de adulto mayor tiene sus categorías"*: cuenta solo el tipo
  «Particulares»;
- y que BelIA vaya avisando los clientes mal clasificados: *"esto está mal
  clasificado, revisa bien"*. Ojo con el paseo de curso: muchas veces no
  cotiza el colegio sino un apoderado, y el cliente es esa persona.

## 2. Lo que entendí

Recepción, solo en las cotizaciones de clientes particulares:

| Puede | No puede |
|---|---|
| Ver el tablero, la ficha y los precios | Ver las de empresas, colegios, clubes y los demás tipos (los requerimientos de todos, sí, como hoy) |
| Crear, editar y enviar la cotización, también pasar un requerimiento a cotización | Aceptarla (el plan de pagos) ni cobrar: sigue en operaciones |
| Anotar en la bitácora y hacer el seguimiento, con «✉ Generar seguimiento» | Dar descuentos (su tope sigue en 0 %; el que ya dio quien vende se mantiene al guardar, pero no sube) |
| Marcarla enviada, en negociación o perdida | Anularla, borrarla (solo borra requerimientos, como hoy) o cambiarle el tipo a un cliente |
| BelIA con los montos de esas cotizaciones | BelIA con montos de las demás |

## 3. Qué es un particular

Cada empresa marca cuál de sus tipos de cliente es «particulares»:
`client_types.es_particular` (migración 186). En Valle del Sol, «Particulares»;
en las demás, el tipo que se llame «Particular…» o «Persona natural» queda
marcado al aplicar la migración, y la empresa lo puede cambiar. Si una
empresa no marca ninguno, recepción sigue como hoy: solo requerimientos.

## 4. La regla, una sola y en el motor

La pantalla esconde, pero la barrera es el motor (mapa 23: *"un cartel es un
cartel"*). Una función decide, con la sesión y el tipo del cliente, qué ve
cada cargo:
- vendedor para arriba: todo, como hoy;
- recepción: todos los requerimientos, y de las cotizaciones solo las de
  clientes particulares; los montos, solo de esas.

Las puertas que entregan o cambian una cotización y lo que hace cada una
con la regla:

| Puerta | Hoy, para recepción | Con la regla |
|---|---|---|
| `GET /quotations` (el tablero) | Entrega TODAS, con montos (la pantalla las escondía) | Requerimientos de todos y cotizaciones de particulares. El calendario pide `vista=calendario`: ahí, todos los eventos, y los demás como agenda (cliente, fecha, personas, estado), sin plata |
| `GET /clients/:id/summary` (resumen del cliente) | Entrega los totales de todas sus cotizaciones y sus pagos | Los montos, solo si el cliente es particular |
| `GET /payments?quotationId=` (las cuotas) | Entrega las cuotas de cualquiera | Solo de una cotización que puede ver |
| `GET /quotations/:id` (la ficha) | Pública: la usa la encuesta de satisfacción, con precios, para cualquiera con el enlace | Con la sesión de recepción, completa si es de particular; si no, la agenda, con sus categorías (la tarjeta del calendario las pide aquí), sin plata. Lo público, pregunta a Felipe (§7) |
| `POST /quotations` y `PATCH /quotations/:id` | Solo requerimientos | También cotizaciones de particulares: sin descuento, sin aceptar ni anular |
| `POST /quotations/:id/enviar-correo` | Vendedor | Recepción, en particulares |
| `POST /quotations/:id/seguimiento` y `GET seguimiento/pendientes` | Vendedor | Recepción, en particulares |
| `GET` y `POST /quotations/:id/aviso-de-cierre` (al marcarla perdida) | Vendedor | Recepción, en particulares |
| `POST /quotations/:id/generar` («✨ Crear con IA») | Vendedor | Recepción, en requerimientos de particulares |
| `POST /quotations/:id/choques/:aceptadaId` («Sí, puede seguir») | Vendedor | Recepción, en particulares |
| La bitácora (`/quotation-followups`) | Recepción y arriba | Igual (la bitácora es contexto, Felipe 04-11) |
| El plan de pagos, los abonos, realizado | Operaciones para arriba | Igual |

## 5. La pantalla

Recepción ve Cotizaciones (el tablero, la ficha y el cotizador) con lo que
el motor le entrega. Sin «Aceptar», sin plan de pagos, sin descuento, sin
anular ni borrar una cotización. Las sumas del tablero salen de lo que ve.

Hecho en R2:
- el menú y las rutas: Cotizaciones y su edición, de recepción para arriba;
- los menús de estado del tablero y de la ficha, sin aceptar, anular ni
  realizada (`estadosPara`); en una que ya está en uno de esos, solo su
  estado, como chip;
- el descuento ya no se le mostraba (tope 0 %);
- en la ficha, el nombre del cliente no lleva a Clientes (sigue siendo de
  vendedor para arriba); cambiar el contacto, sí, mientras se vende;
- **el calendario queda como estaba**: ve todos los eventos, sin montos y
  sin abrir la ficha. Sus particulares los trabaja desde el tablero.

## 6. BelIA

- Para recepción, los montos de las cotizaciones de particulares; las demás,
  sin plata, como hoy (`sinMontos`).
- Recepción propone cambios y cotizaciones nuevas de particulares, sin
  descuento; nunca aceptar.
- **Clientes mal clasificados** (vendedor para arriba): BelIA los avisa en
  «¿Qué tengo que revisar hoy?» y en la ficha del cliente: un nombre de
  institución en «Particulares» (liceo, colegio, club, fundación, SpA,
  municipalidad…), o un particular con nombre de colegio y correo personal
  (*"el cliente es el particular que está cotizando"*). Con una tarjeta para
  cambiar el tipo o el nombre, que se aprueba como las demás (tipo de
  propuesta nuevo `cliente`, migración 186). Recepción no cambia tipos.

## 7. Pregunta abierta

La ficha de una cotización (`GET /quotations/:id`) es pública: la encuesta de
satisfacción la abre sin sesión, y entrega la cotización con precios a
cualquiera que tenga el enlace. Para que recepción no vea las de empresas de
verdad, conviene darle a la encuesta su propia puerta, con lo justo, y que
la ficha completa pida sesión. Espera el OK de Felipe.

## 8. Por tandas

1. **R1, el motor**: la 186, la regla y sus puertas, con sus pruebas (también
   la prueba de la matriz de cargos).
2. **R2, la pantalla**.
3. **R3, BelIA**: los montos, las propuestas y los clientes mal clasificados.
