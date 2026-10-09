# 15 · Carga inicial con IA (onboarding automático)

> **Estado: PLAN, SIN CONSTRUIR** (09-10-2026). Sprint 0 (medición) en
> curso: Felipe enviará ejemplos reales de cotizaciones de coffee y
> cóctel hechas en otros lugares.

## Por qué

Felipe, 09-10-2026: *"no puede ser que alguien se demore semanas en todo
el trabajo de implementación, porque eso es una piedra de entrada
demasiado grande"*. Una empresa nueva debe poder subir su carta, sus
cotizaciones y cómo trabaja, y que un agente con razonamiento avanzado
arme el **primer borrador** de su sistema (categorías, secciones, ítems
con precio, menús guardados, paquetes), que después la empresa ajusta.

Reemplaza la carga por Excel (rota, mapa 05 R8) y cubre lo que Felipe
pidió antes: cargar catálogos desde cotizaciones de banquete en PDF.

## Decisiones hasta ahora

1. **No se entrena un modelo.** Se le enseña en cada pedido con la
   *plantilla de rubro* (abajo) y las reglas de la casa; lo que se mejora
   es la plantilla, y eso le sirve a la empresa siguiente.
2. **Modelo candidato: Claude Opus 5.5** (`claude-opus-5-5`, lee PDF e
   imágenes, salida con estructura exacta, pensamiento adaptativo;
   US$4/US$20 por millón de tokens; ~US$1-2 por empresa, estimado). Si la
   medición con documentos reales lo deja corto: Claude Fable 5.1 (el más
   capaz, US$10/US$50, más lento). Se decide con datos (sprint 0).
3. **La plantilla lleva la ESTRUCTURA de Valle del Sol, nunca sus platos
   ni sus precios** (aislamiento entre empresas; "no tocar nada de Valle
   del Sol").
4. **Las secciones son parte central de la plantilla** (Felipe, 09-10:
   *"tiene un sentido de estructurarlo así al momento de presentar la
   cotización"*): ordenan cómo se lee la cotización.
5. La empresa **revisa** el borrador (con las dudas del agente) y aprieta
   "Crear"; recién ahí se escribe en su cuenta. Después ajusta como
   siempre.

## La plantilla de rubro (medida en Eventia el 09-10-2026, empresa 1)

**Comidas de plato** — Almuerzo, Cena, Almuerzo niños, Lunch box:
Fijos (por defecto) · Bebestibles · Entradas · Ensaladas · Platos únicos
· Principales · Guarniciones · Postres.

**Comidas de mesa** — Desayuno, Once, Snack y sus versiones niños:
Fijo (por defecto) · Bebestibles · Salado · Dulce.

**Coffee & Cóctel**: Bebestibles sin alcohol · Bebestibles con alcohol ·
Bocados salados · Bocados dulces.

**Extras**: Actividades · Bebestibles · Snacks · Otros.

**Servicios de ingreso**: Alojamiento · Ticket de ingreso.

**Servicios paquetizados** (sin secciones).

**Servicios fijos** (salón y otros): Arriendos · Audiovisuales ·
Decoraciones · Actividades.

**Tipos de cliente y de evento**: los de Valle del Sol (ya se siembran al
crear la empresa: migración 117, `sembrarTiposBase`).

**Reglas de la casa que el agente aplica**: nombre de menú guardado
"principal - agregado"; precios con IVA cuando se factura (preguntar si
no está claro); la sección "Fijos (por defecto)" es lo que va siempre en
esa comida.

**Fuera de la plantilla**: las categorías Sernatur (programa propio de
Valle del Sol).

**A normalizar en la plantilla** (en Valle del Sol no se toca nada):
Salado/Dulce vs Dulces, Guarnición vs Guarniciones, "Plato unico" sin
tilde en Lunch box.

## Pendientes

- Ejemplos reales (Felipe, 09-10: coffee y cóctel cotizados en otros
  lugares) → afinan la plantilla y son el set de prueba del sprint 0.
- Una llave de la API de Anthropic, creada por Felipe y puesta por él en
  Railway (nunca en el chat).
- Una línea en la política de privacidad: los documentos se procesan con
  inteligencia artificial.

## Orden de construcción

0. **Sprint 0, medición (sin tocar el sistema)**: plantilla aprobada por
   Felipe + el agente corre sobre los ejemplos → qué catálogo arma, costo
   y demora → se elige el modelo.
1. Motor: carga de documentos + agente + borrador guardado.
2. Pantalla de revisión en el alta + "Crear" con un clic.
3. Pulido: dudas, volver a procesar, topes de costo por empresa.
