# Plan de homologación del sistema — por tandas

_13-08-2026. Pedido de Felipe: "arma un plan por tandas para mejorar
todas las piezas del sistema, existentes y faltantes"._

Basado en dos revisiones completas del frontend (172 archivos, 50.467
líneas) con verificación adversarial, más comprobación a mano de los
hallazgos graves.

---

## La idea, en una frase

Hoy cada pantalla resuelve lo mismo a su manera. Al final, cada cosa se
resuelve **una vez** en una pieza de la casa, y todas las pantallas la
citan — así una mejora llega sola a todas partes.

**Ya pasó**: el 13-08 se le agregó a `SelectWithSearch` el
desplazamiento con flechas y **14 pantallas lo ganaron sin tocarlas**.
Las 6 que tienen copia propia no ganaron nada.

**La condición de Felipe**: la pieza debe respetar los filtros y
características de cada lugar. Lo que cambia entre pantallas se pasa
como parámetro; lo que se comparte es el comportamiento.

---

## El orden general: arreglar → afilar → ordenar

| Fase | Qué es | Por qué va en ese lugar |
|---|---|---|
| **A. Arreglar** | Bugs que hoy muestran datos malos | No dependen de ninguna pieza. Cada día que pasa, alguien ve un número equivocado. |
| **B. Afilar** | Mejorar piezas existentes + crear las que faltan | **Migrar a una pieza coja empeora el sistema.** Primero la herramienta, después el trabajo. |
| **C. Ordenar** | Borrar copias y citar las piezas | Recién acá se cosecha. |

> **La lección que costó**: se estuvo a punto de migrar 6 listas
> plegables a `SelectWithSearch` creyéndola completa. La auditoría
> descubrió que **su teclado está muerto** con la lista abierta y que
> topa a 240 px mientras las copias llegan a 690. Migrar habría
> empeorado el cotizador. **Nunca migrar sin auditar la pieza primero.**

---

# FASE A — Arreglar lo que hoy está malo

Ninguna depende de piezas. Todas se pueden hacer ya.

## Tanda A0 — Fecha del evento ✅ HECHA, sin publicar

Commit `55f56ff` en `feature/portal-cliente-fase2a`. Compuertas pasadas
(tsc 0, 26 pruebas, build, portero). Falta que Felipe la valide.

Arreglaba: la fecha del evento salía **un día antes** en la ficha del
cliente, el plan de pagos y **la encuesta pública que ve el cliente**.
`utils/dates` creció con formatos y separó `formatFechaEvento` (UTC) de
`formatMomento` (hora chilena).

## Tanda A1 — El reloj de Londres

4 lugares preguntan qué día es hoy usando hora universal. Entre las
21:00 y medianoche hora chilena, fallan.

| Archivo | Qué se rompe |
|---|---|
| `MobiliarioTab.tsx:142` | un evento de HOY se cae del cálculo de stock |
| `PostVentaPage.tsx:562` | parte mal la lista entre futuros y pasados |
| `CreateQuotationPublic.tsx:479` | el formulario público bloquea el día equivocado |
| `analytics/index.tsx:43` | corre un día el rango por omisión |

Ya está escrito `hoyEnChile()` en `utils/dates`. Solo hay que aplicarlo.

**Decisión de Felipe sobre el formulario público**: el mínimo es
**hoy + 2** — no se alcanza a hacer un evento de un día para otro. Usar
`hoyEnChileMas(2)`, ya escrito.

⚠️ **Cuidado en MobiliarioTab**: el `today` de la 142 se compara contra
fechas derivadas en 154, 156 y 177 que **también** están en hora
universal. Hoy el archivo es coherente consigo mismo; cambiar solo la
142 mezcla dos relojes y crea un bug nuevo. Revisar el bloque completo.

Riesgo: bajo. 3 de 4 fuera de las pantallas gigantes.

## Tanda A2 — La caída de red disfrazada de "no hay datos"

`ClientsPage.tsx:53` pide los datos y **nunca pregunta si falló**. Como
la lista parte vacía, una caída de red se ve **idéntica** a una empresa
sin clientes. Ninguna de las 7 listas grandes revisa el caso de error.

La regla correcta **ya está escrita a mano 3 veces**. `NegocioPage:287`
lo dice: _"pillada 04-08: durante una racha de red la ficha mostraba un
esqueleto mudo"_.

Se hace junto con la pieza `EstadoDeLista` (Fase B), o antes a mano si
se quiere el arreglo ya.

## Tanda A3 — Botones que no se bloquean

- `ClientsPage.tsx:660` — "Crear Cliente" sin bloqueo: **dos clics = dos
  clientes**. En el mismo archivo, la línea 564 sí lo hace bien.
- `PaymentPlanEditor` — doble clic = **dos planes de pago**.
- 6 modales bloquean Guardar pero **dejan libre Cancelar**: si se
  cancela mientras guarda, la escritura llega igual y el error se pinta
  en una ventana que ya no existe. Uno es el de **reembolso**.

## Tanda A4 — Arreglos sueltos verificados

| Dónde | Qué pasa |
|---|---|
| `MobiliarioTab.tsx:608` | único modal de Logística **sin tope de alto**; en pantalla baja el Guardar queda fuera de alcance. Una línea. |
| `MotivoPerdida` en Post-Venta | **el comentario se tira a la basura**: la pieza lo exige y la pantalla lo ignora |
| `RequestForm` | editar un requerimiento sin fecha **deja la pantalla en blanco** |
| `PaymentPlanEditor` | por redondeo tardío el plan puede quedar $1 sobre el total |
| `QuotationViewer` | si falla la red, **el PDF sale con la lista plana y nadie avisa** |
| `FileViewLink` | si falla el enlace firmado, queda para siempre en "Preparando el archivo…" |
| `EventoCajitas` | falsa alarma: avisa "ese día ya tiene eventos" contra sí misma (es del backend) |

---

# FASE B — Afilar las herramientas

## Tanda B1 — `SelectWithSearch`: el teclado 🔴 BLOQUEA LA FASE C

**Alcance: 15 pantallas. Esfuerzo: bajo.**

El manejador de teclas está en el botón (línea 191), pero al abrir el
foco salta al buscador (95) y el buscador no tiene manejador. **Con la
lista abierta, flechas/Enter/Escape no hacen nada.** El desplazamiento
que se agregó el 13-08 es código muerto: nunca corre.

Hay que darle además:
- **Alto configurable** — topa en 240 px; las copias llegan a ~690.
  Migrar hoy pasaría de ~20 platos visibles a ~6.
- **Abrir y cerrar desde afuera** — hoy dos pueden quedar abiertas a la
  vez, y el botón "Agregar servicio" de Post-Venta no podría abrirla.

⚠️ `group`, `hint`, `dotClass` y `keepOpenOnSelect` **no los usa ninguna
pantalla todavía**: están escritos pero nunca probados en vivo.

## Tanda B2 — `Toast` y `ConfirmInline`

**Toast — alcance 18 pantallas, esfuerzo bajo.** Es el único canal de
avisos del sistema y **en todo el código no existe ni un `aria-live`**:
los 36 avisos de error se pintan en silencio para quien usa lector de
pantalla. Y la X para cerrar es casi invisible, justo en los avisos
pegajosos donde es la única salida.

**ConfirmInline — alcance 10 pantallas + recoge 8 copias.** Logística
**no la importa en ningún archivo**: sus 4 pestañas confirman a mano
para que la tabla no salte (`ConfirmInline` empuja la columna).
`tono` **no lo usa nadie** — el único eje que ofrece está muerto, y los
tres colores que las pantallas necesitan no existen. Bug real: el texto
"Eliminando…" **nunca se ve** porque dos condiciones se prenden juntas.

## Tanda B3 — `MultiSelect`

**Alcance: 3 pantallas + el calendario. Esfuerzo: medio.**

Corrección al dato anterior: **sí tiene casillas y sí tiene contador
total**. Lo que le falta de verdad:

- **Punto de color por opción** (`Calendar.tsx:547`) — con el mismo
  nombre que ya existe: `dotClass`
- **Contador por cada opción** — sin eso, las 3 pantallas actuales lo
  meten a la fuerza dentro del texto ("Efectivos (12)")
- **Casilla de verdad** — la de la pieza es un dibujo; un lector de
  pantalla no sabe que es una casilla
- Forma de chip, poder esconder "Seleccionar Todo", buscador opcional,
  y medirse para abrir hacia arriba

Recién después se migra el filtro del calendario **sin retroceder**.

## Tanda B4 — `NumberInput`: el modo dinero

**Pedido explícito de Felipe.** En campos de **dinero**: solo dígitos,
nada de comas ni puntos tecleados, y **los separadores de miles se
ponen solos**. La coma decimal queda solo en **recetas** y
**porcentajes**.

Aparte, la pieza **le gana siempre a las clases que le manda la
pantalla**, así que 9 pedidos de ancho y color no se aplican. El campo
de personas debe pintarse ámbar cuando alguien pisó el número y hoy ese
aviso llega a medias.

⚠️ El día que se arregle, **esas 9 clases dormidas despiertan juntas**:
9 campos cambian de porte y color de golpe. Revisar pantalla por
pantalla.

## Tanda B5 — Las piezas nuevas baratas (ninguna entra a las gigantes)

| Pieza | Copias hoy | Qué resuelve |
|---|---|---|
| `MenuFlotante` | 6 | el menucito de acciones; hoy 3 técnicas distintas para cerrar y **una que no cierra nunca** |
| `MarcaGuardado` | 6 | el "Guardado ✓"; la regla del 31-07 alcanzó a 2 de 6 |
| `TarjetaDeTabla` | 9 | la tarjeta de Analytics, caparazón idéntico carácter por carácter |
| `AvisoEnLínea` | 16 | la banda que se queda mientras el problema exista |
| `estados.ts` | 9 mapas | la palabra y el color de cada estado |

**`estados.ts` incluye el arreglo de "Anulada"**: el 12-08 Felipe coronó
esa palabra, y la ficha del cliente, el Dashboard y Analytics **siguen
diciendo "Cancelada"**. El calendario se contradice consigo mismo.

⚠️ El Portal es la cara pública y tiene su propio vocabulario: si hereda
el interno, **al cliente le empieza a aparecer "Anulada" y "En
Negociación"**.

## Tanda B6 — `EstadoDeLista`

**Alcance: 13 tablas + 42 textos.** Resuelve de raíz la Tanda A2:
cargando / vacío de verdad / el filtro no encontró nada / **no se pudo
cargar**.

No absorber: el _"Selecciona una fecha"_ del calendario es un quinto
estado, y los textos con ejemplos de Logística son la única ayuda que
hoy tiene alguien nuevo.

## Tanda B7 — El resto de las piezas existentes

`QuantitySelector` (6 pantallas, hoy se traga en silencio lo que está
fuera de rango) · `SectionChipSelect` (7, le faltan valores de texto y
color por opción) · `PermissionGuard` (16 rutas + 11 chequeos a mano;
además muestra "Permisos Insuficientes" cuando lo que falló fue la red)
· `PageSkeleton` (cero parámetros: viste a todos de Dashboard) ·
`FileViewLink` (última: mucho costo, 2 pantallas de beneficio).

## Tanda B8 — `VentanaModal` 🔴 LA MÁS GRANDE

**27 archivos arman su propia ventana.** Ninguna se porta igual: unas
cierran con Escape, otras al pinchar el fondo, otras con ninguno.
**Ninguna bloquea el scroll de atrás** (`document.body.style` no aparece
ni una vez en todo el código).

⚠️ Tres cosas se rompen si se hace mal:
1. Si el cierre al pinchar afuera viene **encendido**, un clic distraído
   bota un formulario a medio llenar. Debe venir **apagado**.
2. Si usa "dibujar fuera del árbol", los formularios cambian de dueño y
   **el Guardar envía el formulario equivocado**.
3. `QuotationViewer` maneja su propio scroll: si se le impone el molde,
   se rompe la hoja de la cotización.

**No meter ahí** el bloqueo de scroll ni el registro de capas de una
vez: hoy no existen, así que eso no es unificar deuda sino **inventar
función nueva** en 27 pantallas a la vez. Y **no encender Escape en
todas**: 26 de 28 no lo tienen y varias son formularios largos.

## Tanda B9 — `Botón`, `PieDeAcciones`, `Campo` (entran a las gigantes)

**79 botones azules en 41 archivos con 40 estilos distintos** para lo
mismo. **50 botones de editar/eliminar** con 5 tamaños. **83 etiquetas**
en 4 variantes — y de 158 etiquetas **solo 45 están atadas a su
recuadro**: hacerle clic a la palabra "Teléfono" hoy no hace nada.

⚠️ El color no es solo azul/gris/rojo: hay verdes para "Aceptar plan" y
"Confirmar pago", y rojo para "Guardar reembolso". Si la paleta no los
trae, esas pantallas **pierden el significado del color**.

❌ **No normalizar los 83 tamaños de etiqueta de una vez**: los
formularios densos de Logística y Post-Venta usan texto chico para que
el modal quepa. La pieza sí, la normalización no.

---

# FASE C — Ordenar el sistema

Solo cuando la pieza correspondiente esté sana.

| Tanda | Qué se migra | Requiere |
|---|---|---|
| **C1** | 6 listas plegables a mano → `SelectWithSearch` | B1 |
| **C2** | filtro del calendario → `MultiSelect` | B3 |
| **C3** | 8 confirmaciones a mano → `ConfirmInline` | B2 |
| **C4** | **101 montos a mano → `formatCurrency`** | — |
| **C5** | 27 ventanas → `VentanaModal` | B8 |
| **C6** | los botones, por etapas | B9 |

**C1 en detalle**: `ServiciosTab` 1285, 1566, 1777 · `QuotationForm`
2908, 3270, 3625. Una por una, validando cada una.

⚠️ **C4, la plata** — dos trampas verificadas:
1. En varios sitios el `$` está escrito aparte y solo se pasa el número
   (Calendar 899, QuotationsPage 936, ServiciosTab 1943, QuotationForm
   3809). Meter la pieza sin sacar el signo da **`$$1.234.567`**.
2. Hay **5 maneras distintas de redondear**. Unificar **cambia totales
   que el equipo ya tiene memorizados**. Avisar ANTES.

Se puede partir por Logística, Servicios, Portal y ClientDetail sin
entrar a las gigantes.

---

# Reglas del ritual, para todas las tandas

1. **Una tanda a la vez.** Nada de mezclar.
2. **Compuertas antes de empujar**: `npx tsc --noEmit` = 0 ·
   `npm run test` · `npm run build` · `npm run portero`.
   Recordar: `export PATH="$HOME/.local/node20/bin:$PATH"`.
3. **Laboratorio → Felipe valida → producción.** Nunca saltarse el medio.
4. **Bajar el techo del portero** cada vez que se migre algo. Si no, el
   terreno ganado queda libre para volver a perderse.
5. **Auditar la pieza antes de migrar a ella.** La lección de
   `SelectWithSearch`.
6. **Escribir en `04_ESTADO_ACTUAL.md`** — es el único punto de
   encuentro entre sesiones.

## Lo que el portero NO vigila todavía

Solo mira dentro de `pages/`. Cuando las piezas nuevas se creen en
`components/`, los contadores bajan solos y los techos quedan holgados.
**Hay que apretarlos a mano en el script.**

Y hoy **no vigila las ventanas modales**, que es lo que de verdad está
copiado 27 veces. Al crear `VentanaModal` (B8), agregarle su regla.
