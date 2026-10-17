# 17 — Módulo de Oportunidades (licitaciones y compras ágiles)

> **Estado: sprint 1a en el laboratorio, sprint 2 construido.** Conversado
> con Felipe el 16-10-2026 y escrito el mismo día. El radar quedó en el
> laboratorio el 17-10 (migración 122 aplicada en la base del lab, motor en
> `pruebas`) y la pantalla se construyó el mismo día, todo en la rama
> `feature/oportunidades-radar`. Nada en producción. Su mapa es
> `mapa/24_OPORTUNIDADES.md`. Si una sesión futura recuerda algo distinto,
> **manda este documento**; si la conversación cambia una decisión, se
> corrige aquí en el mismo movimiento.

## 1. Por qué

Valle del Sol tiene desde el 29-05-2026 un bot en GitHub
(`valledelsol-automation`, `run_compra_agil.py`) que revisa Mercado Público y
manda un correo con las oportunidades. Felipe, 16-10: *"no ha funcionado nada
los correos con los avisos... hay licitaciones grandes que no han aparecido y
otras que son irrelevantes"*.

Lo medido ese día:

- **Se escaparon las grandes de Quillón.** "Producción de evento Día del
  Profesor" (4364-13-LE26, $15.960.000) y "Ceremonia y cena Día del
  Funcionario" (1532886-5-LE26, $12.000.000), las dos publicadas el viernes
  9-10 y con cierre el lunes 19-10, **no están** entre las ~560 que el bot
  procesó en sus últimos 30 días. Ese viernes el bot sí revisó más de 30
  licitaciones; estas dos no.
- **Causa de fondo, en palabras de Felipe:** *"nuestro problema no trabajamos
  con una base de datos"*. El bot pide `licitaciones.json?fecha=<hoy>` y lo
  que no aparece en esa lista en ese momento se pierde para siempre. Además
  pesca por palabras **solo en el título**, y su regla "ante la duda, amarillo"
  llena el correo de ruido.
- **Los compradores categorizan mal.** Felipe buscó por su rubro en Mercado
  Público y el Día del Profesor no salía: *"la gente que sube esto lo sube mal.
  No lo sube bien categorizado"*. Por eso la IA tiene que **leer** cada
  licitación, no confiar en la categoría.
- **Casi no hay competencia.** En 2025 las tres recurrentes de Quillón
  tuvieron **una sola oferta** cada una (ver §9).

Lo que se busca: no perder ninguna, separar el ruido con el criterio del
negocio (*¿se puede hacer en el complejo?*) y quitarle a Felipe lo tedioso de
postular: armar la cotización y llenar los documentos.

## 2. Qué miramos antes de diseñar

**Licify** (licify.cl, chileno) y **LicitaLab** son los referentes. Felipe abrió
cuenta en Licify el 16-10 (prueba gratis hasta el 30-10, vinculada a VALLE DEL
SOL QUILLON SPA); se exploró por dentro ese día.

| Lo que hace Licify | Cómo |
|---|---|
| Base con todo | 13.592 oportunidades abiertas en Chile el 16-10; 1.749 en Ñuble y Biobío |
| Filtro | "Líneas de negocio" con hasta 200 palabras clave, en título o descripción. **No es IA:** se le cuela "Banquetas sala de espera" por "banquetería" |
| Ficha | Fechas (preguntas, respuestas, aperturas, adjudicación), productos, criterios con su peso, foro, archivos, indicadores del comprador (% de pago no oportuno, % de irregularidad) |
| Historial de cambios | Por licitación: archivos nuevos (la aclaratoria del Día del Profesor llegó el 15-10), fechas movidas, cambios de estado |
| Competencia | Ofertas recibidas con precio, adjudicación, perfil de cada proveedor |
| Anexos | "Adjuntar Anexos" partió el Word del Día del Profesor en 6 anexos y les puso variables (`{{rut_proveedor}}`, `{{direccion_proveedor}}`…) para llenarlas con los datos de la empresa y firmarlas |
| Lo que deja en blanco | Experiencia (formulario 3), calidad de la propuesta (4) y oferta económica (5) = **70% de la nota** del Día del Profesor |
| Velocidad | Vio el Día del Profesor (publicado 15:54) a las 18:55, y el del Funcionario (13:24) a las 16:30: **~3 horas** |
| Precio | Buscador gratis; alertas y anexos desde 1 UF al mes (plan Equipos) |

**Lo que Eventia tiene y Licify no:** el catálogo de la empresa (paquetes,
menús, salones), sus cotizaciones y su historial de eventos realizados. Con eso
se llenan justo los anexos que deciden la nota y se arma la cotización. Ese es
el diferencial; no tiene sentido construir "otro buscador".

**Cómo lo hace la industria** (Brainial, Tendium, Inventive, AutoRFP; Box con
Claude para generar Word): el botón deja un trabajo en el **servidor**, la IA
lo hace, el resultado queda guardado y una persona revisa antes de enviar. Los
pasos que todos repiten: pasar las bases a texto (con OCR), sacar los
requisitos a un checklist que apunta a la página de las bases, seguir cambios y
aclaraciones, redactar desde la experiencia anterior, revisión humana siempre.

## 3. Decisiones de Felipe (16-10-2026)

1. **Base de datos con ingesta progresiva y filtro con IA.** *"Traer la mayor
   cantidad posible llenando una base de datos de forma progresiva y diaria y
   luego IA genera un filtro avanzado sobre qué interesa"*.
2. **Solo lo nuevo, con su fecha de cierre, y ojo si se reabre.** Acordado:
   "nuevo" quiere decir **"no está en nuestra base"**, nunca "publicado hoy"
   (ese fue el error del bot).
3. **Quién ganó el año anterior, a qué valor y con qué servicios.**
4. **La IA categoriza, filtra y genera los documentos** para subir a Mercado
   Público (*"porque eso también es muy tedioso"*).
5. **Todo dentro de Eventia**, con botones: *"un botón allá pinchar generar
   documento"*. Se conversó hacerlo con Claude en el Mac de Felipe; se decidió
   **el servidor**, como la industria, para que funcione con el Mac apagado, lo
   usen Camila y Recepción y se pueda vender después.
6. **Haiku 5.5 para la lectura diaria** (*"para lectura yo creo que Haiku 5.5
   está bien"*). Opus 5.5 para generar cotizaciones y documentos.
7. **La llave de Anthropic va en Railway.** Creada por Felipe el 16-10
   (`eventia-motor`, ver `00_DOCUMENTACION/01_CLAVES.md` §5 en la carpeta
   maestra). Variable `ANTHROPIC_API_KEY` de `api-rest-pruebas`, aplicada
   por Felipe el mismo 16-10 (el redespliegue del laboratorio terminó bien).
8. **"Generar cotización" entra al módulo.** Es el mismo botón diseñado en
   `16_PROPUESTAS_DE_COTIZACION.md` §6, que estaba en pausa.
9. **"Grande" es el monto de alto valor de la empresa**, el que ya existe en
   Configuración de empresa (`companies.high_value_threshold`): *"usemos la
   misma definición que está en la configuración de empresa así queda
   variable"*. Valle del Sol: $3.000.000 (medido el 16-10).
10. **Los avisos van al correo de la empresa** (`companies.notifications.replyTo`):
    Valle del Sol, contacto@valledelsolquillon.cl (medido el 16-10).
11. **Las regiones se configuran en el módulo**, por empresa: *"eso debería
    ser configurable en el módulo de Eventia"*. Lo mismo las comunas
    cercanas (§5.7).

Decisiones del 17-10-2026 (respuestas de Felipe a lo pendiente):

12. **Todo Chile** en la base, no solo las regiones configuradas (§5.1).
13. **`mp_procesos` fuera del respaldo diario de Eventia** (riesgo 9).
14. **Solo administradores**: Felipe y Camila (perfil administrador).
15. **Sin resumen por correo**: *"ya no se necesita el resumen, se revisa
    en Eventia"*. El aviso inmediato de comuna cercana y alto valor queda
    por confirmar.
16. **Directo al laboratorio, sin otro mockup**: *"terminado esto, anda
    directo al sprint 2"*. La base de la pantalla es el mockup del 16-10.

## 4. Reglas del módulo (no se negocian)

1. **La IA propone, la persona decide.** Nada se sube a Mercado Público
   automáticamente; Felipe revisa, firma y sube. Las declaraciones juradas las
   firma él: la IA llena datos, no declara.
2. **Nunca un precio a dedo.** La oferta económica sale de una cotización de
   Eventia armada con el catálogo (regla de la casa del 14-10).
3. **Nada se borra.** Lo descartado y lo cerrado quedan: son el historial que
   alimenta "quién ganó el año anterior".
4. **Lo público es de todos; lo de cada empresa, de cada empresa.** Los datos
   de Mercado Público van en tablas comunes (son públicos e iguales para
   todos). La clasificación, el estado, las notas y los documentos van con
   `company_id`, y cada consulta filtra por empresa (regla del motor).
5. **Solo Valle del Sol al principio.** Derecho nuevo `oportunidades`,
   entregado por `companies.modulos_propios` como Personal y Marketing
   (`mapa/15`, §5.7 y §5.8). Venderlo es otra decisión.

## 5. Cómo funciona

### 5.1 El radar (cada 2 horas)

1. **Licitaciones:** una sola consulta liviana a
   `licitaciones.json?estado=activas` ("todas las licitaciones publicadas al
   día de realizada la consulta", documentación oficial de ChileCompra). Se
   compara con la base:
   - código que no está → se pide el detalle (`?codigo=`) y se guarda, **de
     todo Chile**. Cambio al construir (16-10): la
     región solo viene en el detalle, así que hay que abrir cada licitación
     igual, y guardarla evita volver a abrirla cada 2 horas. La IA lee solo
     las de las regiones de cada empresa. **Confirmado por Felipe el
     17-10** (decisión 12);
   - código que ya está y cambió su fecha de cierre → se actualiza y se anota
     en el historial;
   - código que estaba cerrado y vuelve a aparecer → se reabre y se anota.
2. **Compras ágiles:** API v2 con `publicado_desde` = última corrida exitosa
   menos un margen (48 h) y región 8,16; se compara con la base igual que
   arriba.

   Lo que enseñó el código del bot (17-10): la API de licitaciones a veces
   responde 200 **con el error adentro** (`Codigo` y `Mensaje`), y rechaza
   las peticiones simultáneas con el mismo ticket. El radar revisa el
   cuerpo de cada respuesta, reintenta las "peticiones simultáneas" y pide
   **de a uno**, primero lo que cierra antes. Y frena con 429 si se le pide
   en ráfaga (medido en el laboratorio el 17-10): el radar deja 1 segundo
   entre pedidos y espera ante un 429 antes de darlo por "sin cupo". Cada corrida pide detalles
   hasta los 80 minutos y lee hasta los 150; lo que falta entra en la
   próxima (así nunca llega a las 3 horas en que la siguiente la da por
   muerta).
3. **Regiones:** las que tenga configuradas cada empresa en el módulo
   (§5.7); el radar trae la unión de todas. Valle del Sol parte con Ñuble y
   Biobío.
4. **Archivos:** para las que la IA marca del rubro, se bajan bases, anexos y
   aclaratorias desde la ficha pública de Mercado Público (la API no los
   entrega) y se pasan a texto, con OCR si vienen escaneados. **A verificar
   en el sprint 1**: la forma exacta de bajarlos.
5. **Al cerrar:** se guarda quién ganó, el precio, cuántos ofertaron y el
   enlace al acta (vienen en el detalle de la API: `Adjudicacion`,
   `NumeroOferentes`, `UrlActa`, ganador por ítem).
6. **Historia:** una vez, al partir, se cargan 2 o 3 años de Ñuble y Biobío
   con `?fecha=` día por día, de noche (ChileCompra pide las descargas grandes
   entre 22:00 y 07:00). Primero se filtra por nombre con Haiku y solo se pide
   el detalle de las candidatas.

### 5.2 La lectura con IA (Haiku 5.5)

Cada licitación nueva se lee **una sola vez por empresa** con derecho:
nombre, descripción y productos (y las bases cuando ya estén). Devuelve, con
salida de estructura fija:

- etiquetas propias: evento, alimentación, alojamiento, capacitación con
  salón, paseo, otro;
- `se_hace_en_el_complejo`: sí / no / dudoso;
- semáforo verde / amarillo / rojo, y la razón en una frase.

**El criterio sale del perfil de la empresa**: el catálogo de Eventia
(paquetes, menús, salones) más la ficha del oferente (§5.5). No hay lista de
palabras clave.

Reglas que mandan sobre la IA:

- organismo de una comuna cercana (lista configurable, §5.7; Valle del Sol
  parte con la del bot: Quillón, Bulnes, Ránquil, Portezuelo, San Ignacio,
  El Carmen, Pemuco, Coelemu, Ninhue, Treguaco, Florida, Yumbel, Cabrero)
  **y del rubro** (alguna etiqueta distinta de "otro") → nunca rojo, y aviso
  inmediato. Afinado al construir (16-10): una compra de hormigón de Quillón
  sigue roja;
- monto igual o mayor al de **alto valor** de la empresa
  (`companies.high_value_threshold`, Configuración de empresa; Valle del Sol
  $3.000.000) → aviso inmediato;
- las rojas no se botan: quedan en la base, y el primer mes se revisa una
  muestra cada semana para medir lo que se le escapa a la IA.

Sumado al construir (16-10): lo que cierra antes se lee primero (si una
corrida se corta, lo urgente ya quedó leído); si la IA falla por la cuenta
(llave, cupo por minuto, saldo, modelo), la lectura se detiene y sigue en la
próxima corrida, y diez fallas seguidas también la detienen. Si el modelo
se niega o no devuelve nada legible, queda en amarillo para revisar a mano.

### 5.3 La pantalla "Oportunidades" (solo Valle del Sol)

Tabla con semáforo, nombre, organismo, comuna, monto, cierre, la razón y el
enlace a Mercado Público, con filtros. Al lado de cada una, **la del año
anterior**: quién ganó, a qué precio y cuántas ofertas hubo. Botones **Me
interesa** / **Descartar**, responsable y estado (nueva → en estudio →
postulada → ganada / perdida / descartada). Ficha con fechas, archivos,
criterios con su peso e historial de cambios. Calendario de las recurrentes
("en noviembre viene el Día de Campo del Dirigente"). Ficha de cada
competidor. **Sin resumen por correo** (decisión 15, 17-10): se revisa en
Eventia, que se pone al día cada 2 horas. El aviso inmediato para las
comunas cercanas y las de alto valor, al correo de la empresa
(`companies.notifications.replyTo`; Valle del Sol:
contacto@valledelsolquillon.cl), queda por confirmar. Solo la ven los
administradores (decisión 14). Piezas del kit de la casa (`CLAUDE.md`):
`SelectWithSearch`, `ChipDeEstado`, `Modal`, `Toast`, `ConfirmInline`.

### 5.4 Botón "Generar documentos" (Opus 5.5)

En la ficha de una oportunidad "Me interesa", con su cotización ya armada:

1. El motor crea un trabajo y responde al tiro; la pantalla muestra "en
   proceso" y avisa cuando está listo.
2. Llama a Claude por la API con: las bases en PDF (con citas a la página),
   los anexos en Word (Files API), los datos de la empresa, la cotización y la
   experiencia (eventos realizados en Eventia: cliente, año, monto), usando
   las habilidades de Word y PDF de Claude (Agent Skills + ejecución de
   código).
3. Devuelve y guarda en Eventia:
   - **checklist** de todo lo que piden las bases, con la página: ✅ listo ·
     🔄 lo generó Eventia · ⚠️ falta o está vencido · ✋ le toca a Felipe;
   - **anexos llenos**: identificación y declaración jurada (datos de la
     empresa), experiencia (eventos de Eventia), oferta económica (total de la
     cotización, bajo el presupuesto, con IVA);
   - **propuesta técnica** desde la cotización, con logo y fotos del complejo
     (30% de la nota en el Día del Profesor);
   - **revisión final**: lo generado contra las bases.
4. Felipe revisa, firma y sube. Los archivos que entrega la API vencen: el
   motor los copia al almacenamiento de Eventia apenas llegan.

### 5.5 La carpeta y la ficha del oferente

- **Carpeta de documentos de la empresa** con fecha de vencimiento y aviso
  antes de vencer: patente municipal, inicio de actividades, programa de
  integridad (lo pidió el Día del Profesor, dictamen CGR E370752/2023), F30,
  certificado de vigencia, resolución sanitaria, declaración de trabajadores.
- **Ficha de Valle del Sol como oferente**: datos legales (VALLE DEL SOL
  QUILLON SPA, RUT 77.701.305-K), representante, salones y capacidades,
  experiencia destacada. Es el perfil que usa la IA para leer y para escribir.

### 5.6 Botón "Generar cotización" (Opus 5.5)

El diseño es el de `16_PROPUESTAS_DE_COTIZACION.md` §6: el modelo propone ids
del catálogo y el motor decide los números con `computeMoney`, valida contra
el catálogo de la empresa, guarda en **solicitada** y deja las notas en la
**bitácora**, nunca en Observaciones (regla del 14-10). Novedad de este
módulo: **Me interesa** crea el requerimiento con los datos de la licitación
(personas, fechas, comidas, lugar). La skill `armar-cotizacion` del chat es la
receta que se convierte en las instrucciones del agente.

### 5.7 Configuración del módulo (por empresa)

Una pestaña "Configuración" dentro de Oportunidades:

- **Regiones de interés** (Valle del Sol parte con Ñuble y Biobío).
- **Comunas cercanas**: las que nunca quedan en rojo y avisan al instante
  (Valle del Sol parte con la lista del bot, §5.2).

Lo que **no** se configura aquí, porque ya existe en Configuración de
empresa y no se duplica: el monto de alto valor
(`companies.high_value_threshold`) y el correo de avisos
(`companies.notifications.replyTo`).

## 6. Piezas (propuesta para el sprint 1, a confirmar al construir)

**Construido en el sprint 1a (16-10, migración 122):** `mp_procesos`,
`mp_cambios`, `mp_radar_corridas` (la bitácora del radar, que también es su
candado; no estaba en esta propuesta), `oportunidades` y
`oportunidades_config`. Quedan para después `mp_archivos` (sprint 1b) y
`oferente_documentos`, `oferente_ficha` y `postulaciones` (sprint 3).

**Tablas comunes (datos públicos de Mercado Público, sin `company_id`):**

| Tabla | Qué guarda |
|---|---|
| `mp_procesos` | Una fila por licitación o compra ágil: código, tipo, nombre, descripción, organismo, unidad, región, comuna, monto, fechas, estado, criterios, productos, adjudicación, primera vez visto, última actualización |
| `mp_archivos` | Archivos de cada proceso: nombre, tipo (bases, anexo, aclaratoria), ruta en el almacenamiento, texto extraído, resumen |
| `mp_cambios` | Historial: qué cambió y cuándo (fecha de cierre, archivo nuevo, estado, reapertura) |

**Tablas de cada empresa (con `company_id`):**

| Tabla | Qué guarda |
|---|---|
| `oportunidades` | La lectura de la IA para esa empresa (etiquetas, semáforo, razón, modelo usado) y lo que la empresa decide (estado, responsable, notas, cotización asociada). Única por empresa y código |
| `oportunidades_config` | La configuración del módulo (§5.7): regiones de interés y comunas cercanas. Tabla aparte para no sumarle columnas a `companies` (cada campo nuevo de `companies` queda editable desde la Torre, mapa 15) |
| `oferente_documentos` | La carpeta: tipo, archivo, vence el, notas |
| `oferente_ficha` | La ficha del oferente (§5.5) |
| `postulaciones` | Cada "Generar documentos": estado del trabajo, checklist, archivos generados, tokens usados |

**Motor:** módulo `oportunidades/` con el patrón de 4 capas; reloj
`oportunidades-cron.service.ts` cada 2 horas; ruta "correr ahora" para el
laboratorio (ahí los relojes no corren); candado en la base para que dos
corridas no se pisen; derecho `oportunidades` en cada ruta (la prueba
`matriz-de-derechos.spec.ts` frena una ruta sin decidir).

**Variables nuevas en Railway:** `ANTHROPIC_API_KEY` (en el laboratorio
desde el 16-10; en producción al pasar) y el ticket de Mercado Público
(`MP_TICKET`, lo pega Felipe).

## 7. Sprints

| Sprint | Qué | Se da por bueno cuando |
|---|---|---|
| 1. Radar | Migraciones, derecho `oportunidades` para Valle del Sol, radar con solo lo nuevo, cierre y cambios, lectura con Haiku 5.5, adjudicaciones, historia de 2–3 años | En el laboratorio aparecen el Día del Profesor y el del Funcionario bien marcados, la historia muestra "Día del Profesor 2025: ganó Centro Turístico Sol de Quillón por $12.000.000", y en una semana de comparación Licify no muestra nada del rubro que el radar no tenga |
| 2. Pantalla | "Oportunidades", ficha, año anterior, decidir, calendario, competidores, avisos | Felipe la usa una semana en vez del correo del bot; ahí se apaga la parte de Mercado Público del bot de GitHub |
| 3. Generar documentos | Carpeta y ficha del oferente, botón, checklist, anexos, propuesta técnica | Una postulación real sale lista para firmar y subir |
| 4. Generar cotización | Botón del doc 16 §6 y "Me interesa" → requerimiento | Se prueba en el laboratorio; la regla de "10 seguidas sin corrección" (skill `armar-cotizacion`) sigue siendo la vara para abrirlo a todos |

**El sprint 1 se partió en dos al construir (16-10).** 1a: migración,
derecho, radar con solo lo nuevo, cierres movidos y reaperturas, lectura con
Haiku 5.5 — hecho en la rama `feature/oportunidades-radar`, sin aplicar. 1b:
bajar los archivos, guardar quién ganó al cerrar y la historia de 2–3 años.

**Primera prueba en el laboratorio (17-10, corrida 5):** el Día del
Funcionario (1532886-5-LE26) y el Día del Profesor (4364-13-LE26) de
Quillón quedaron en la base y salieron en **amarillo con "comuna
cercana"** (el Funcionario también con "alto valor"): la IA los ve del
rubro pero las descripciones no dicen dónde se hacen. En la primera
lectura: 121 leídas de Ñuble y Biobío, 9 amarillas, 112 rojas, ninguna
verde. **Ojo:** en el Día del Profesor Quillón ocultó el monto en Mercado
Público (`VisibilidadMonto` 0), así que la API no lo trae y la alerta de
alto valor no se puede encender; Licify lo sacó de las bases, y eso llega
con los archivos (sprint 1b).

**Sprint 2, construido el 17-10** (Felipe: *"terminado esto, anda directo al
sprint 2"*): la bandeja, la ficha y la configuración, sin resumen por
correo. Quedan para después de la historia (1b): "el año anterior", el
calendario de recurrentes y la ficha de competidores. El aviso inmediato
de comuna cercana y alto valor espera la respuesta de Felipe.

Cada sprint: laboratorio primero, validación de Felipe, y su "a producción".
Las migraciones van al laboratorio y a producción **antes** del motor.

## 8. Costos (estimados, a medir el primer mes)

| Tarea | Modelo | Estimado |
|---|---|---|
| Leer y etiquetar una licitación | Haiku 5.5 | ~US$0,001; ~US$6 al mes con ~200 nuevas al día |
| Generar documentos de una postulación | Opus 5.5 | ~US$1 |
| Generar una cotización | Opus 5.5 | ~US$0,3 |

Tope: límite de gasto mensual de la organización en la consola de Anthropic,
**USD 50** (medido el 16-10; lo fijó Felipe). Saldo ese día: 9,84 US$, sin
recarga automática. La consola ofrece "Tu plan Max incluye USD 200 al mes en
créditos de API" (botón "Comenzar"): decisión de Felipe.

## 9. Datos de partida (medidos el 16-10-2026)

| Recurrente de Quillón | 2025 | Ganó | Precio | Ofertas |
|---|---|---|---|---|
| Día del Profesor | 4364-5-LE25 | Centro Turístico Sol de Quillón SpA | $12.000.000 | 1 |
| Día del Funcionario (cena) | 4352-6-LE25, tope $17M | BPM Eventos SpA | $13.949.580 | 1 |
| Día de Campo del Dirigente | 5040-25-LE25, tope $17M | Parque Aventuras Antu S.A. | $17.000.000 | 1 |

Día del Profesor 2026 (4364-13-LE26): 28 y 29 de octubre, ~235 personas en un
centro de eventos, almuerzo y amplificación; criterios precio 30, calidad de
la propuesta 30, **ubicación geográfica 20**, experiencia 10, programa de
integridad 5, requisitos formales 5 — los mismos de 2025.

## 10. Riesgos

1. **La API de Mercado Público se cae a ratos** (504 entre agosto y octubre de
   2026, lección del bot): reintentos, y una fuente caída no tumba la otra.
2. **Mercado Público demora en mostrar lo publicado** (~3 h vistas en
   Licify): por eso se compara contra la base y no contra "hoy".
3. **Bajar los archivos depende de la página web de Mercado Público**: si la
   cambian, se rompe. Pieza aislada, con prueba, y aviso si una licitación del
   rubro queda sin archivos.
4. **La IA se equivoca**: reglas de Quillón y monto por encima de la IA, y
   muestra semanal de rojas el primer mes.
5. **Relojes solo en producción** (`NODE_ENV=production`, zona 9 del mapa):
   el laboratorio prueba con "correr ahora".
6. **Una tabla nueva sin `GRANT` a `service_role`** deja la pantalla en error
   42501 (mapa 18): cada migración lo incluye.
7. **Lo que firma Felipe es responsabilidad de Felipe**: la declaración
   jurada y la oferta se revisan siempre antes de subir.
8. **El bot de GitHub y el motor comparten el ticket de Mercado Público**
   (10.000 consultas al día por ticket): mientras convivan, se reparten el
   cupo. La primera corrida pide unos 6.000 detalles; laboratorio y
   producción usan el mismo ticket, así que no hacen su primera corrida el
   mismo día.
9. **El respaldo diario de Eventia arma un solo archivo en memoria con
   todas las tablas** (mapa 16), y `mp_procesos` crece con todo Chile (unas
   500 por día). **Resuelto en el código el 17-10** (decisión 13):
   `FUERA_DEL_RESPALDO` en `backup-cron.service.ts` la deja fuera; son
   datos públicos que se vuelven a pedir, y Supabase guarda su propia copia
   diaria. Lo de cada empresa (`oportunidades`, `oportunidades_config`) sí
   queda en el respaldo.

## 11. Lo que no se hace

Postulación automática por reglas (sirve para vender productos en serie, no
eventos); subir la oferta a Mercado Público por Felipe con un usuario robot;
portales privados (wherEX, SeNegocia); convenio marco; app móvil propia.
Más adelante, si se pide: precio de referencia con el historial, ver la
oferta técnica del ganador anterior (Mercado Público la publica tras la
apertura si la licitación lo indica), análisis del acta cuando se pierde,
indicadores de pago del comprador, foro, firma escaneada, orden de compra →
evento confirmado.

## 12. Pendiente (Felipe)

1. ~~Pegar el ticket de Mercado Público en Railway~~: hecho por Felipe el
   16-10 (`MP_TICKET` en `api-rest-pruebas`).
2. Activar o no los USD 200 al mes de créditos de API del plan Max.
3. ~~OK para el laboratorio~~: dado el 17-10.
4. ~~¿Todo Chile o solo las regiones?~~: todo Chile (decisión 12).
5. ~~Sacar `mp_procesos` del respaldo~~: hecho en el código (decisión 13).
6. ~~Quién ve el módulo y el resumen por correo~~: administradores, sin
   resumen (decisiones 14 y 15). Queda: ¿el aviso inmediato de comuna
   cercana y alto valor se mantiene? ¿Las rojas se esconden por omisión?

Decidido el 16-10 (§3, puntos 9 a 11): "grande" = monto de alto valor de la
empresa; avisos al correo de la empresa; regiones y comunas cercanas
configurables en el módulo.
