# 25 · Compras con IA y bodega

> **Estado (23-11-2026):** acordado con Felipe y construido en la rama `feature/provision-con-ia` (carpeta `wt-provision`), con la migración 214. **Solo en el laboratorio; no está en producción.** El mapa es `mapa/06_LOGISTICA_COMPRAS_E_INVENTARIO.md`.

## 1. Lo que pidió Felipe

Sus palabras, resumidas, del 23-11-2026:

1. **Sacar el modal** «Confirmar la compra» (24-08), donde se escribían a mano lo comprado y lo gastado de cada insumo. *"Es demasiado trabajo manual todas las semanas."* (Medido ese día: desde el 18-09 nadie lo usaba; 0 provisiones en 60 días.)
2. **Subir las últimas compras** (facturas, boletas, guías de despacho o pantallazos de pedidos) y que la IA proponga la actualización de los costos, con el «así queda»: insumo, costo de antes, costo nuevo y de qué compra salió. *"Alguien lo revisa, le da check y avanza."*
3. **El costo, no el precio:** *"la idea es que el costo se vaya actualizando a medida de que se van ingresando las compras. Entonces el catálogo de costos, importante, no precios, se utilicen desde ahí… para tener los márgenes bien."*
4. **Cortes y marcas equivalentes:** *"si es aceite Pedrito, aceite Juanito, o es carne de lomo vetado, lomo liso, que esas sí se venden por separado, pero la carne a la olla no, porque la carne a la olla hay varios cortes que son equivalentes."*
5. **Stock superficial y manual**, en una pestaña nueva «Stock» de Proveedores: *"con el tengo ya se soluciona gran parte"*; las compras suben el stock y los eventos lo bajan; la lista de compras descuenta lo que hay.
6. **Etapa B, no ahora** (§6).

La maqueta se mostró antes de programar (la pestaña Stock con «Subir compras» arriba y «Insumos · costo y bodega» abajo) y Felipe dijo *"Sí, constrúyelo"*.

## 2. Las decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | Sale el modal. «Provisionar» es un clic y congela el costo del catálogo de ese momento (`buildRows`, como siempre). Compras ya no escribe en `supplies`. | El costo real llega por las compras subidas (D2); escribirlo dos veces era el trabajo manual que Felipe quería sacar. |
| D2 | La pestaña **Stock** de Proveedores: arrastrar PDF o foto (≤ 10 MB). **Sonnet** lee el documento con una estructura fija y asocia cada línea a un insumo del catálogo de la empresa. | Sonnet: tiene que entender cortes, marcas y conversiones de formatos («2 x 5 L» = 10 L) contra unos 375 insumos; Haiku se equivoca más en esto (la misma vara que la 132 de Oportunidades). Unos centavos de dólar por documento; el costo de cada lectura queda en `compras_subidas.costo_ia_usd`. |
| D3 | Nada cambia sin el check. Cada línea muestra lo que dice la compra, el insumo, la cantidad, el total, el costo de antes y el nuevo con su %. Parte marcada si tiene insumo y no cambia más de **20 %**; si sube o baja más, sale en ámbar y sin marcar (una baja grande también suele ser un error de lectura). | Felipe: revisar, dar check y avanzar. La IA puede leer mal (L19). |
| D4 | Lo que se corrige en la revisión: el insumo (lista con buscador de la casa), la cantidad y «No es insumo» (fletes, despacho). | Lo justo para dejar una línea bien sin volver a un formulario. |
| D5 | Al **aplicar** una línea: el costo por unidad base (total ÷ cantidad) va a `supplies.price` (y `package_price` = costo × formato, si el insumo tiene formato), la cantidad **suma a la bodega** y el texto de la línea queda **aprendido** para ese proveedor: la próxima compra igual se asocia sola, aunque la IA dude. | «El catálogo aprende de la compra» ya era regla (24-08); ahora aprende de la compra subida. |
| D6 | **Neto o con IVA:** la IA dice si los montos de las líneas son netos (factura) o con IVA (boleta, pedido de supermercado). La factura deja el costo neto; la boleta, el total pagado. La tarjeta lo dice con un chip «neto» / «con IVA». | El IVA de una factura se recupera; el de una boleta no. |
| D7 | **Equivalentes = nombres de UN insumo** (`insumo_equivalentes`): `corte` (carne a la olla = punta paleta, sobrecostilla, guachalomo, carnicero), `marca` (aceite maravilla = Pedrito, Juanito) y `texto` (lo aprendido, por proveedor). La receta sigue usando el insumo; la compra de cualquier corte o marca actualiza su costo, y la línea dice qué corte llegó. Lo que se vende por separado (lomo vetado, lomo liso) son insumos distintos. | Felipe: los cortes de la carne a la olla cuestan más o menos lo mismo. Un insumo genérico con sus nombres no toca las recetas ni la cuenta de Compras. |
| D8 | **El costo del genérico es el de la última compra aplicada**, sin promedios. | Simple y trazable: se sabe de qué compra salió. |
| D9 | **La bodega** (`insumo_movimientos`): «Tengo» fija el conteo; «Saqué» resta; la compra aplicada suma; los **eventos realizados** cuyo último día es posterior al día del conteo restan lo que pide su receta (la misma cuenta de Compras, `@consolidacion`). Lo de los eventos **no se guarda**: se calcula, así desmarcar un evento realizado corrige la bodega sola. Sin ningún «Tengo», la bodega no se conoce. | Felipe: *"con el tengo ya se soluciona gran parte"*. Calcular en vez de guardar evita enganchar los cambios de estado de las cotizaciones (varias puertas los cambian). |
| D10 | **Compras descuenta la bodega:** columnas Necesito, Bodega y Comprar (= necesito − bodega, nunca < 0). El formato, el PDF y el CSV usan lo que falta comprar. | Lo pidió así. El costo de la fila sigue siendo el de lo que pide el evento (es su costo, no lo que se compra). |
| D11 | La bodega cuenta los eventos de **todos** los tipos de cliente. | Es la bodega física; con un tipo apagado la cifra sería falsa. Lo que se oculta por cargo son los eventos, no el total. |
| D12 | En Insumos, «Precio» pasa a decir **«Costo»**. | Es el costo del catálogo de insumos; el precio es el de venta. |

## 3. Cómo funciona

### 3.1 Subir y leer (`POST /logistics/stock/compras`)
1. `ComprasService.subir` valida el archivo, arma las instrucciones (`leer-compra.ts`: el catálogo `id | nombre | unidad | equivale: …` sin lo aprendido) y llama a Sonnet con `ESQUEMA_DE_LA_COMPRA`.
2. `propuestaDeLaCompra` descarta un insumo que no es de la empresa, aplica lo aprendido del mismo proveedor (manda sobre la IA), calcula el costo por unidad base y guarda el de antes.
3. El proveedor se busca entre los de la empresa por nombre (`proveedorDe`). Si el mismo N° del mismo proveedor ya se subió, avisa.
4. El archivo va al balde privado en `c<empresa>/compras/` (se ve con `FileViewLink`), y la compra queda «por revisar» con sus líneas.

### 3.2 Revisar y aplicar
`PATCH …/compras/lineas/:id` cambia el insumo, la cantidad, el total o «no es insumo» y recalcula. `POST …/compras/:id/aplicar` aplica solo las líneas marcadas (D5); la compra queda «aplicada» cuando no le quedan líneas por aplicar con insumo. «Descartar» la saca sin tocar nada.

### 3.3 La bodega (`bodega.ts`, puro)
```
bodega = último «Tengo»
       + compras aplicadas después
       − «Saqué» después
       − receta de cada evento realizado con último día > día del conteo (hora de Chile)
```
Un evento del mismo día del conteo no resta: el conteo ya lo vio. Si da negativo, se muestra en rojo («vuelve a contar»).

## 4. Pantallas
- **Proveedores → Stock** (`components/stock/StockTab.tsx`): «Subir compras» (zona de arrastre con `useArrastreDeArchivos`, una tarjeta por compra por revisar, «Últimas compras aplicadas» plegado) e «Insumos · costo y bodega» (buscador por insumo, corte o marca; «Solo los contados»; «Tengo» y «Saqué» en la fila; al abrir la fila, los equivalentes con «+ Agregar» y los movimientos).
- **Proveedores → Compras**: sin modal; Necesito, Bodega y Comprar.
- **Proveedores → Insumos**: «Costo» en vez de «Precio».

## 5. Lo que queda fuera de esta etapa
- «Crear insumo» desde una línea de compra: por ahora se crea en Insumos y se asocia.
- El aviso cuando un evento ya provisionado cambia su costo de catálogo: la foto de provisión sigue mandando (regla de siempre).

## 6. Etapa B (anotada, NO se construye ahora)
- Que **todas** las boletas y facturas de compra pasen por aquí (también las de Recibidos de facturacion.cl, doc 19 §9.28).
- Que la **guía de despacho** se lea como entrada de bodega aunque no traiga precios.
- **Fudo:** unir el stock de Fudo (restaurante) y el de Eventia, y sus salidas. Lo primero que hay que decidir es si es **una sola bodega** o dos. Hoy el conector de Fudo es solo de lectura.
- **Control de inventario por evento**: lo que salió de verdad contra lo que pedía la receta.
- Que Eventia **actualice Fudo**.

## 7. Migración
`docs/migrations/214_compras_con_ia_y_bodega.sql`: `insumo_equivalentes`, `compras_subidas`, `compras_subidas_lineas` e `insumo_movimientos`, cerradas al navegador. No toca tablas existentes. Se aplica a mano en cada base **antes** de publicar el motor.
