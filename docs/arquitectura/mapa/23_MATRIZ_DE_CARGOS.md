# Mapa: La matriz de cargos, aplicada al motor

> **Estado: verificado una vez contra el código** (rama `pruebas`, 14-09-2026). Aplicada en el motor el 14-09-2026, paso 2 del roadmap de venta, con las cuatro decisiones de Felipe de ese día. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

El 14-09-2026, para el paso 2 del roadmap de venta, El motor tiene
113 puertas que hoy solo piden estar logueado. La regla para cada una: se
abre al cargo **más bajo** de las pantallas que la usan, según la matriz que
ya existe en la app. Cuando la pantalla es de todos pero la acción no, se
anota como decisión.

Los cuatro cargos, de menor a mayor: **recepción**, **vendedor**,
**operaciones**, **administrador**. Cada nivel incluye a los de arriba.

## Recepción y arriba

Todo lo que usa el mostrador: atender, buscar, mirar.

- Cotizaciones: listar, ver una, crear y editar. El motor ya tiene el
  candado de que recepción solo crea y edita **requerimientos**, nunca
  cotizaciones formales; se conserva.
- Revisar choques de fecha.
- Consultas del embudo: listar, convertir y descartar.
- Tipos de evento: leer.
- Clientes: listar, ver la ficha y el resumen 360, leer tipos, leer contactos.
- Crear cliente y crear contacto: recepción los necesita para levantar un
  requerimiento.
- Ver las cuotas de una cotización, que el tablero muestra como estado.
- Calendario.
- Subir y ver archivos del seguimiento y de la ficha.
- Ver la propia empresa y el propio perfil, y cambiar la propia clave.

## Vendedor y arriba

Lo que ya vende.

- Borrar una cotización, y mandarla por correo. **Decisión 1, tomada**: el candado
  de requerimientos también aplica a borrar (`QuotationsService.remove`
  recibe el cargo), y enviar por correo es de vendedor.
- Catálogo, leer: servicios, secciones fijas, menús guardados y paquetes.
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
