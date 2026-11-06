# Mapa: La matriz de cargos, aplicada al motor

> **Estado: verificado una vez contra el código** (rama `pruebas`, 14-09-2026). Aplicada en el motor el 14-09-2026, paso 2 del roadmap de venta, con las cuatro decisiones de Felipe de ese día. El 27-10-2026 se sumaron las dos rutas del personaje y el color (migración 167), las dos de recepción y arriba. El 06-11-2026, las 9 puertas «más abiertas que sus pantallas» (doc 22 §4.3): la ficha 360 pasó a vendedor y arriba (Clientes), corregir la cosecha al administrador (Dashboard) y la puerta vieja del calendario se borró. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

El 14-09-2026, para el paso 2 del roadmap de venta, El motor tiene
113 puertas que hoy solo piden estar logueado. La regla para cada una: se
abre al cargo **más bajo** de las pantallas que la usan, según la matriz que
ya existe en la app. Cuando la pantalla es de todos pero la acción no, se
anota como decisión.

Los cuatro cargos, de menor a mayor: **recepción**, **vendedor**,
**operaciones**, **administrador**. Cada nivel incluye a los de arriba.

## Recepción y arriba

> **03-10-2026, en las pantallas (Felipe: "creo que el perfil de recepción ve demasiadas cosas ... requerimiento y calendario, pero no más que eso"):** recepción ve solo **Requerimientos**, **Calendario** (solo mirar: sin montos, sin estrella de alto valor y sin abrir la ficha del negocio) y **Mi cuenta**. Cotizaciones, Consultas, la ficha del negocio y Clientes pasaron a vendedor para arriba (`SECTION_ROLES.quotations` y `.clients` = `SALES_AND_UP` en `frontend/src/constants/permissions.ts`; `veNegocio` en `pages/calendar/Calendar.tsx`). **El motor no cambió**: recepción sigue pudiendo leer cotizaciones (el calendario y Requerimientos las usan) y buscar o crear clientes y contactos (el formulario de requerimiento lo necesita). Lo de abajo describe las puertas del motor.

> **05-11-2026 (doc 22 §9):** qué tipos de cliente trabaja cada cargo es un interruptor de Permisos por cargo. Lo de recepción con los particulares (doc 21, abajo) es su valor de fábrica; los otros tres cargos parten con todos los tipos. La regla la aplica `AlcanceDeRecepcion` a los cuatro cargos.

> **04-11-2026, en las pantallas (doc 21):** recepción vuelve a ver **Cotizaciones**: el tablero, la ficha y el cotizador (`SECTION_ROLES.quotations` y `.quotations_edit` = `RECEPTION_AND_UP`, y las dos en su menú). Lo que le llega lo filtra el motor. En los menús de estado no le aparecen aceptar, anular ni realizada (`estadosPara`, `frontend/src/utils/recepcion.ts`); el descuento ya no se le mostraba (tope 0 %); en la ficha, el nombre del cliente no lleva a Clientes, que sigue siendo de vendedor para arriba. El calendario queda igual: solo mirar.

Todo lo que usa el mostrador: atender, buscar, mirar.

- Cotizaciones: listar, ver una, crear y editar. El motor ya tiene el
  candado de que recepción solo crea y edita **requerimientos**, nunca
  cotizaciones formales; se conserva. **Desde el 04-11-2026 (doc 21),
  también las cotizaciones de clientes particulares** (el tipo que la
  empresa marca con `client_types.es_particular`, migración 186): verlas
  con precios, crearlas, editarlas, enviarlas, «✨ Crear con IA», el
  seguimiento, el aviso de cierre y «Sí, puede seguir», sin descuento y sin
  aceptar, anular ni marcar realizada. Lo decide una sola pieza,
  `AlcanceDeRecepcion` (`clients/alcance-de-recepcion.ts`), que usan el
  tablero (`GET /quotations` ya no le entrega las de otros tipos: antes le
  llegaban todas con montos), la ficha con su sesión, las cuotas, el
  resumen del cliente (sin montos si no es particular), crear y editar
  (`QuotationsService.update`: el descuento que ya dio quien vende se
  mantiene al guardar, pero no sube). El calendario pide su propia vista
  (`vista=calendario`), con todos los eventos y los que no son de
  particulares sin plata; la ficha de uno de esos le llega igual, como
  agenda. Las rutas de enviar, generar, el
  seguimiento, el aviso de cierre y los choques pasaron de vendedor a
  recepción, y cada una revisa que la cotización sea de un particular.
- Revisar choques de fecha.
- Catálogo, leer (doc 21, 04-11-2026): servicios, secciones fijas, menús
  guardados y paquetes, con sus grupos. Recepción cotiza a los particulares
  desde el cotizador, que los necesita; ahí usa los menús y los paquetes sin
  guardarlos, renombrarlos ni borrarlos (`soloElegir` en `MenusGuardados` y
  `SelectorDePaquetes`).
- Consultas del embudo: listar, convertir y descartar.
- Tipos de evento: leer.
- Clientes: listar, leer tipos, leer contactos. La ficha 360 (`GET /clients/:id/summary`) pasó a
  vendedor y arriba el 06-11-2026 (doc 22 §4.3): la lee solo la pantalla de Clientes, que recepción
  no ve desde el 03-10. Si se le prende Clientes, la vuelve a ver, sin los montos de lo que no es
  particular (doc 21).
- Crear cliente y crear contacto: recepción los necesita para levantar un
  requerimiento.
- Ver las cuotas de una cotización, que el tablero muestra como estado.
- Calendario: la vista de calendario de la lista de cotizaciones (`vista=calendario`, doc 22 §4.4).
  La puerta vieja, `GET /calendar/events`, que nadie llamaba y le entregaba a cualquier cargo todas
  las cotizaciones con sus montos, se borró el 06-11-2026 (doc 22 §4.3).
- Subir y ver archivos del seguimiento y de la ficha.
- Ver la propia empresa y el propio perfil, y cambiar la propia clave.
- El personaje y el color (27-10-2026, migración 167): ver los de su
  empresa (`GET /users/apariencias`) y cambiar los propios
  (`PATCH /users/apariencia`). Las dos con `RECEPTION_AND_UP`, no "solo
  sesión": así la prueba de la matriz las tiene anotadas por nombre.
- BelIA, la ventanilla de chat con IA (doc 20 §13, 04-11-2026: *"para que
  también pueda la recepcionista trabajar con Belia"*): las nueve rutas de
  `/asistente` pasan a `RECEPTION_AND_UP`, con el derecho `asistente`. Lo
  que ve cada cargo lo deciden sus herramientas: a recepción le llegan sin
  plata ni enlace a la ficha, y solo crea requerimientos. Desde el doc 21,
  lo de un cliente particular le llega completo y lo puede cotizar con
  BelIA (mapa 25). Corregir un cliente mal clasificado
  (`proponer_cambio_de_cliente`, doc 21 §6) es de quien vende, como editar
  el cliente: recepción no cambia tipos. Incluye la
  conversación de quien escribe (`GET`, `PUT` y `DELETE
  /asistente/conversacion`, migración 182), siempre la de la sesión.

## Vendedor y arriba

Lo que ya vende.

- Borrar una cotización, y mandarla por correo. **Decisión 1, tomada**: el candado
  de requerimientos también aplica a borrar (`QuotationsService.remove`
  recibe el cargo), y enviar por correo es de vendedor.
- Catálogo, cambiarlo: los menús guardados y los paquetes (guardar, renombrar,
  borrar, ordenar sus grupos). Leerlo pasó a recepción y arriba el 04-11
  (doc 21: ver arriba).
- Evia, la ventanilla de chat con IA (doc 20, 03-11-2026): `POST
  /asistente/mensajes`, con el derecho `asistente`. Felipe: *"lo usa
  administración y vendedores"*. (Desde el 04-11, las rutas de BelIA son
  de recepción y arriba: ver arriba.) Cada herramienta de Evia pide además el
  cargo de la pantalla que muestra ese dato (doc 20 §3). Desde la fase 2
  (03-11), también `POST /asistente/propuestas/:id/aplicar`, `descartar` y
  `deshacer`, el «Sí, aplicar» de sus tarjetas, y desde el 04-11 `POST
  /asistente/mensajes/en-vivo`, la misma pregunta con la respuesta en vivo: la ruta es de vendedor, y
  cambiar una aceptada lo revisa el servicio, solo para operaciones y
  administración, como Post-Venta → Servicios (mapa 25).
- Editar y borrar clientes, contactos y tipos de cliente, y marcar el
  contacto principal. **Decisión 2, tomada** (Felipe: recepción "debería poder ver qué
  cotizaciones tiene un cliente vigente, no editar, no eliminar"): la
  pantalla la ven todos, editar y borrar es de vendedor.

## Operaciones y arriba

Lo que ya se cobró y se opera.

- Post‑Venta: abonos y comprobantes del portal, leer y confirmar.
- Las sillas de personal por cargo y monto, y leer fichas de liquidación.
- Borrar archivos.

## Solo administrador

- Personal completo, salvo las sillas: directorio, planificación,
  liquidación, propina, nómina, evaluaciones, notas e histórico.
- El costo de personal y lo pagado por mes del Dashboard.
- Gestión de usuarios: listar.
- Configurar el embudo: textos y brochures por tipo de evento, y crear,
  editar o borrar tipos de evento. **Decisión 3, tomada**: administrador. Leer
  la configuración sigue abierto, porque la pantalla de Consultas la carga.
- Códigos de servicio en uso.
- Respuestas de la encuesta de satisfacción.
- Oportunidades (doc 17, mapa 24): la bandeja, la ficha, decidir (estado, responsable, notas), la configuración del módulo, correr el radar y ver sus corridas, subir, listar y eliminar las bases y anexos, ver Se viene y los competidores, pedir y ver el análisis de las bases con IA, los datos de la empresa como oferente, su firma y su carpeta de documentos, y validar los documentos de la postulación (17-10). Además exige el derecho `oportunidades`. Decisión de Felipe del 17-10: *"solo el administrador y Camila (que es perfil administrador)"*. Rama `feature/oportunidades-radar`; nada en producción.

## Se quedan como están

- El propio perfil, la propia clave y la propia empresa: solo sesión, con
  la comparación contra la sesión dentro del controller.

- Super‑admin: tiene su propia lista blanca por correo.
- Eventia Móvil, 5 puertas: las usa la app de terreno con el login de cada
  persona. **Decisión 4, tomada**: la usan operaciones y administrador; el
  módulo completo queda en operaciones hacia arriba.
- La puerta de premium sin pago: ya está apagada.

## Cómo se aplica

Un decorador de cargo por ruta en el motor, ruta por ruta, con una prueba
por módulo que verifique que el cargo más bajo entra y el de abajo no. Nada
cambia en la pantalla: la app ya esconde lo mismo. Valle del Sol no ve
diferencia, porque sus tres usuarios ya trabajan dentro de estos cargos.

## Cómo se protege

`api-rest/src/auth/tests/matriz-de-cargos.spec.ts` lee los decoradores
reales de 16 controladores y falla si una ruta acordada cambia de cargo o si
aparece una ruta nueva sin cargo. Agregar una ruta a uno de esos
controladores obliga a declararle cargo, o a anotarla como "solo sesión a
propósito" en la prueba.

## El cargo ya no basta: también tiene que estar el derecho

El mismo 14-09-2026, en el paso 3.2, se sumó el **candado por plan**. Desde
entonces el acceso a una ruta se decide con dos preguntas, y las dos tienen
que decir que sí:

1. **¿El cargo lo permite?** La responde `RolesGuard` con esta matriz.
2. **¿La empresa tiene el derecho?** La responde `DerechosGuard`, el cuarto
   guardián, con la lista de derechos que el plan de la empresa rellena.

Son independientes a propósito: un administrador de una empresa en el plan
Cotiza no entra al Calendario, y una recepcionista de una empresa en Opera y
Crece tampoco entra a Personas. Nada de lo acordado acá cambia; se le sumó
una segunda pregunta. El detalle vive en `15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md`,
§5.8.

Esta matriz tiene desde ese día una **hermana**:
`api-rest/src/auth/tests/matriz-de-derechos.spec.ts`, que hace lo mismo con
los derechos. Aquella cuida que ninguna ruta quede sin cargo; esta cuida que
ninguna función de un plan superior quede sin candado de plan. Las dos leen
los decoradores reales, no una copia.

## Desde el 05-11-2026: los interruptores (permisos por cargo, doc 22)

Cada empresa prende y apaga por cargo las secciones del menú. La matriz de
arriba sigue siendo **lo de fábrica**: el día que se instala, nadie gana ni
pierde nada.

Cada puerta dice de qué sección es, junto a su `@Roles` de siempre:

- `@Permiso('postventa', 'cotizaciones')`: la puerta es de esas secciones y
  se abre a todo cargo que tenga prendida alguna. Así una puerta que usan
  varias pantallas sigue abierta mientras el cargo tenga una.
- `@DentroDe('postventa')`: una acción fina dentro de esa sección; exige el
  `@Roles` de hoy **y** la sección prendida. Prenderle Post-Venta a un
  vendedor le abre los pagos como a operaciones, pero no «Volver a
  pendiente», que sigue siendo del administrador (tanda 2).

La cuenta (`pasa`, en `auth/permisos.ts`): `permitido = prendidos(@Permiso) ∪
(@Roles ∩ prendidos(@DentroDe))`. Medido el 05-11-2026 en `main`: 318
puertas quedan gobernadas por los interruptores y 33 quedan solo con su
`@Roles`, a propósito: la sesión propia (5), las de cualquier cargo (4), el
cobro del plan (4), Eventia Móvil (5), la Torre de Control (6) y 9 «más
abiertas que sus pantallas», cuyo cierre es una decisión aparte, anotada y
no tomada (doc 22 §4.3).

**Cómo se protege.** `matriz-de-cargos.spec.ts` calcula el cargo de fábrica
de cada ruta con esa cuenta y lo compara con lo acordado: los valores no
cambiaron. `permisos-de-fabrica.spec.ts` recorre **todas** las puertas del
motor: cada una con permisos tiene que dar, de fábrica, exactamente su
`@Roles`, y las que no llevan permiso tienen que ser exactamente las 24
fijas (eran 33 hasta el 06-11-2026, doc 22 §4.3), cada una con su porqué. Una puerta nueva tiene que decir de qué
sección es o entrar a esa lista.

**Lo que no cambia.** El candado por plan (`DerechosGuard`) sigue igual. El
Calendario del vendedor: de fábrica prendido (Felipe, 05-11-2026); antes no
estaba en su menú pero entraba por «Ver en calendario».
