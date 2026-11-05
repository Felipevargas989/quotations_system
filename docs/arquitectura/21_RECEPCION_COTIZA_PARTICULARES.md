# 21 · Recepción cotiza a los particulares

> **Estado: PLAN del 04-11-2026 en la noche.** Felipe lo aprobó ese día
> (*"perfecto todas tus indicaciones"*). Va al laboratorio por tandas; a
> producción, solo con su «a producción». Migración reservada: **186**
> (con Facturación, que tiene la 184), aplicada en el laboratorio. Las
> tandas R1 (el motor) y R2 (la pantalla) escritas esa noche en la rama
> `feature/recepcion-particulares`, y en el laboratorio desde las 22:5x
> (pruebas 35699c36). La R3, primera parte (BelIA con los particulares, y
> el catálogo que le faltaba al cotizador), en el laboratorio desde la
> madrugada del 05-11 (pruebas 397cb8ef); la segunda parte (los clientes
> mal clasificados), escrita esa misma madrugada (Felipe: *"siga en
> secuencia con todas las partes que falten"*). Con eso, las tres tandas
> están escritas; a producción, con su «a producción». El 05-11 en la
> mañana, el filtro por tipo de cliente del tablero, para todos (§5).

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
| `GET /quotations/:id` (la ficha) | Pública: la usa la encuesta de satisfacción, con precios, para cualquiera con el enlace | Con la sesión de recepción, completa si es de particular; si no, la agenda, con sus categorías (la tarjeta del calendario las pide aquí), sin plata. Lo público queda como está (§7, decisión de Felipe) |
| `POST /quotations` y `PATCH /quotations/:id` | Solo requerimientos | También cotizaciones de particulares: sin descuento, sin aceptar ni anular |
| `POST /quotations/:id/enviar-correo` | Vendedor | Recepción, en particulares |
| `POST /quotations/:id/seguimiento` y `GET seguimiento/pendientes` | Vendedor | Recepción, en particulares |
| `GET` y `POST /quotations/:id/aviso-de-cierre` (al marcarla perdida) | Vendedor | Recepción, en particulares |
| `POST /quotations/:id/generar` («✨ Crear con IA») | Vendedor | Recepción, en requerimientos de particulares |
| `POST /quotations/:id/choques/:aceptadaId` («Sí, puede seguir») | Vendedor | Recepción, en particulares |
| La bitácora (`/quotation-followups`) | Recepción y arriba | Igual (la bitácora es contexto, Felipe 04-11) |
| Leer el catálogo (`GET /services`, `/services/fixed-sections`, `/service-groups` y `/service-group-collections`, con sus grupos) | Vendedor | Recepción y arriba: el cotizador los necesita para cotizar a un particular (se notó en R3). Cambiarlo sigue en vendedor y administrador |
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
  sin abrir la ficha. Sus particulares los trabaja desde el tablero;
- en el cotizador usa los menús guardados y los paquetes, sin guardarlos,
  renombrarlos, borrarlos ni ordenar sus grupos (`soloElegir`);
- en la lista de clientes del cotizador ve solo a los de sus tipos
  particulares, más el que ya está elegido (`clientesParaElCotizador`; la
  lista de tipos trae la marca `es_particular`). Al guardar, el motor lo
  revisa igual;
- y el filtro por tipo de cliente del tablero (Felipe, 05-11-2026), que
  es para todos, a ella le ofrece solo los tipos particulares
  (`filtroPorTipo.ts`; mapa 02 §6).

## 6. BelIA

- Para recepción, los montos de las cotizaciones de particulares; las demás,
  sin plata, como hoy (`sinMontos`). **Hecho (R3, primera parte):** lo de un
  particular le llega completo, con la marca `particular: true`, y la red
  (`taparPlata`) deja pasar solo eso y el catálogo (mapa 25).
- Recepción propone cambios y cotizaciones nuevas de particulares, sin
  descuento; nunca aceptar. **Hecho:** cambiar servicios, anotar, preparar el
  seguimiento y crear cotizaciones con servicios, solo de particulares,
  revisado al proponer y otra vez al aplicar (`propuestas/de-recepcion.ts`);
  con su tope de 0 %, BelIA no le propone descuentos. Suma también sus
  seguimientos pendientes (solo de particulares) y el catálogo.
- **Clientes mal clasificados** (vendedor para arriba): BelIA los avisa en
  «¿Qué tengo que revisar hoy?» y en la ficha del cliente: un nombre de
  institución en «Particulares» (liceo, colegio, club, fundación, SpA,
  municipalidad…), o un particular con nombre de colegio y correo personal
  (*"el cliente es el particular que está cotizando"*). Con una tarjeta para
  cambiar el tipo o el nombre, que se aprueba como las demás (tipo de
  propuesta nuevo `cliente`, migración 186). Recepción no cambia tipos.
  **Hecho (R3, segunda parte):** con los casos del 04-11 como regla: los
  clubes a gremios (el de adulto mayor, a su tipo), las fundaciones y las
  SpA a empresas, los colegios a colegios, las municipalidades a empresas
  públicas, y con nombre de colegio, correo personal y un contacto, el
  cliente pasa a ser esa persona. La tarjeta avisa si con el cambio
  recepción deja de ver (o empieza a ver) sus cotizaciones.

## 7. La encuesta: la vía queda abierta (decidido)

La ficha de una cotización (`GET /quotations/:id`) es pública: la encuesta de
satisfacción la abre sin sesión y muestra solo el N°, el tipo de evento y la
fecha, pero recibe la cotización completa, con precios, a quien tenga el
enlace. Con su sesión, a recepción una que no es de particulares le llega
como agenda; sin sesión, completa. Se propuso darle a la encuesta su propia
puerta con esos tres datos. Felipe, 04-11-2026: *"dejemos esa vía abierta no
importa"*. Queda como está: el enlace es un código largo que no se adivina.

## 8. Por tandas

1. **R1, el motor**: la 186, la regla y sus puertas, con sus pruebas (también
   la prueba de la matriz de cargos).
2. **R2, la pantalla**.
3. **R3, BelIA**: los montos y las propuestas (primera parte) y los
   clientes mal clasificados (segunda parte). Las dos, hechas.

**A producción**, con el «a producción» de Felipe y en este orden: la 186 en
la base de producción, el motor (PR desde `feature/recepcion-particulares`)
y después la vitrina, que manda `vista=calendario` (el motor viejo la
rechaza).
