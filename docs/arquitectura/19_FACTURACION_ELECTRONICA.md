# 19 · Facturación electrónica (boletas y facturas desde Eventia)

> **Desde el 08-11-2026 también en producción (PR #315, sin migración):**
> «Ver» abre el visor apenas llega el PDF, y el XML sin contratar lo dice
> en una línea (§9.33). Felipe: *"sí a ambos"*.
>
> **§9.27 «El RUT arriba» y §9.31 a §9.33 EN PRODUCCIÓN desde el
> 08-11-2026** (Felipe: *"sí, hazlo, pruébalo y luego a producción"*;
> PR #314; sin migración): el RUT primero con lo que trae achurado,
> «Por facturar» con el buscador y la revisión una por una, «Corregir»
> con la pieza de «Nuevo DTE», la fecha de emisión elegida hasta el
> último día del mes, dos pasos para emitir, el PDF que llega solo y el
> XML con su botón. Probado antes en el ambiente de prueba de
> facturacion.cl con una factura fechada el 30-11 (§9.32).
>
> **§9.26 a §9.28 EN PRODUCCIÓN desde el 08-11-2026** (Felipe: *"a
> producción"*; PR #312; las migraciones 192 y 193 en las dos bases,
> vacías y antes del motor; la nómina del SII se carga con «Cargar la
> nómina del SII» después del motor). Medido esa mañana en producción:
> la nómina, cargada (1.709.121 empresas en 3,5 minutos); las 8 OC de
> «Por facturar», leídas solas; y «Recibidos», sin servicio: facturacion.cl
> dice que el módulo WSPANELDTE se contrata aparte (§9.28; lo decide
> Felipe).
>
> **EN PRODUCCIÓN desde el 07-11-2026** (Felipe: *"a producción"*; PR #310;
> las migraciones 184, 187, 189 y 191 en las dos bases, antes del motor).
> Conectado a facturacion.cl desde la noche del 07-11 (Felipe cargó las
> credenciales en Railway; facturas desde la N° 381). Las boletas, en
> pausa hasta que facturacion.cl las habilite (OT 377564).
>
> **Estado: en construcción (04-11-2026).** Felipe aprobó el plan v2 (*"si
> avanza así"*). **Paso 1a en el laboratorio desde el 04-11:** la migración
> 184 (`razones_sociales`, varias por cliente; `ordenes_de_compra` con el
> RUT de cada OC; y `documentos_tributarios` con su cadena) y la tarjeta
> «Datos de facturación» de la ficha del cliente, con la lista de razones
> sociales y «Referencias que pide» (§9.12).
> **Paso 1b construido el 04-11** (sin rutas ni pantallas, no cambia nada a
> la vista): los armadores del archivo y facturacion.cl simulado (§9.13).
> El 1a se rehízo esa tarde con la lista de razones sociales (§9.12,
> Felipe: *"si vamos avancemos"*).
> **Paso 2a construido el 04-11 en la noche** (Felipe: *"que estamos
> esperando?"*): la pestaña «Facturación» de Post-Venta con las órdenes de
> compra del evento, solo con el módulo propio `facturacion` (§9.14).
> **Paso 2b construido esa misma noche:** «✨ Leer con BelIA» el PDF de
> la OC (§9.14). Probado en el laboratorio (evento #423): llenó la OC de
> prueba y con un informe dijo que no es una orden.
> **Paso 2c construido esa misma noche:** «Facturar» en cada OC (o sin OC):
> el borrador de BelIA como la maqueta, «Editar a mano», «Ver cómo sale» y
> «Emitir factura» contra facturacion.cl simulado, con la lista de lo
> emitido (§9.15). Probado en el laboratorio con CCU (#408): la factura
> simulada N° 1.
> **Paso 3a construido el 05-11** (Felipe: *"si avancemos con el paso 3"*):
> «Por boletear» en el evento y la sección «Boletas» de recepción, con el
> reparto por cabaña y una boleta por cabaña (§9.16). La D3 quedó decidida.
> Probado en el laboratorio con el evento #423: las boletas simuladas N° 1,
> 2 y 3. **Paso 3b construido el 05-11** (Felipe: *"si avancemos con el
> 3b"*): la boleta suelta con el tarifario y la pantalla del tarifario
> (§9.16). **Paso 4 construido el 05-11** (Felipe: *"puedes avanzar
> haciendo tú todas las pruebas hasta completar el trabajo"*): la lista de
> Facturación con la cadena de anulaciones, las notas de crédito y de
> débito, «Comprobar» y el reporte (§9.17). **Paso 5a construido el 05-11**
> (Felipe: *"avancemos con el paso 5"*): la conexión de verdad por el SOAP
> de facturacion.cl, dormida hasta que Felipe cargue las credenciales en
> Railway; «Probar la conexión»; y los candados para no mezclar ambientes
> (§9.18). Lo que queda: las credenciales, el paso 0 en el ambiente de
> pruebas, la certificación y el «a producción». **El 05-11, una sola
> sección «Facturación»** con pestañas por cargo (§9.19). **Esa tarde, la
> pestaña del evento es «Emitir DTE»** (Felipe: *"ok, vamos programa"*):
> factura o boleta, se llena desde la OC que BelIA lee sola de Documentos o
> desde la cotización, y se edita a mano (§9.20). **El 06-11, el paso 0
> hecho en el laboratorio** con las credenciales de prueba: una boleta, una
> factura, la NC que la anula y la ND que anula la NC salieron de verdad en
> el ambiente de prueba de facturacion.cl, con su PDF; la tabla está en el
> §9.18 (5b). Lo que queda: que Felipe lo revise en el Libro de Ventas, la
> certificación y el «a producción». **El 07-11, todo se factura en
> Facturación** (§9.23, Felipe: *"ok hazlo"*): la pestaña del evento en
> Post-Venta salió; recepción emite boletas y facturas con el tarifario, y
> operaciones y el administrador facturan los eventos. **Esa tarde,
> «Ya está facturado»** en «Por facturar» y la boleta solo a un
> particular (§9.24, migración 191): las boletas, en pausa.
>
> **Plan v2 (04-11-2026).** El 04-11 Felipe sumó la factura armada por IA desde el evento, la nota de
> pedido, las boletas por cabaña de recepción y el circuito de anulación: va
> en el §9, que reemplaza los pasos del §6.
>
> **Estado anterior: PLAN para aprobar (26-10-2026).**
> El proveedor es facturacion.cl (Desis). Felipe pidió: *"armemos el plan,
> pero revisa bien las limitaciones de la api de facturación.cl"*. Las
> limitaciones están en la §3; se revisaron contra el manual completo y
> contra el servicio en vivo. Este documento manda sobre la memoria.

## 1. Por qué

Felipe, 26-10-2026:

- *"revisa esto para ver si podemos empezar a facturar desde el sistema"*.
  Lo dijo junto con la respuesta de soporte de facturacion.cl (OT cerrada,
  enviada a felipe@): para automatizar facturas y boletas hay que contratar
  el **Servicio de Integración**.
- Datos de facturación: *"pedimos el [RUT] en caso de pedir factura, razón
  social como los datos de facturación. En el cliente va a tener que crear
  una parte que se llama datos de facturación, con el correo y todo el
  cuento"*.
- Órdenes de compra: *"en caso de que hayan órdenes de compra, necesitamos
  referenciar la orden de compra como se debe hacer (…) que traiga (…) la
  descripción, el monto y qué porcentaje de la orden de compra vamos a
  facturar"*.
- Boletas: *"también la idea es poder emitir boletas electrónicas. Desde el
  perfil de recepción (…) un botoncito de emitir boleta o quizás hacer un
  módulo de facturación (…) las boletas de las cabañas las voy a empezar a
  emitir por ahí"*.

**Lo que hay hoy en Eventia.** No emite nada. En Documentos del evento
guarda el PDF de la factura y el de la OC, en las categorías `facturas` y
`ordenes_compra`. También tiene la casilla `requires_invoice`, que ningún
evento aceptado tiene marcada desde julio.

## 2. Cómo se conecta facturacion.cl

**Contratación y credenciales**
- El **Servicio de Integración** se contrata en la plataforma: Inicio →
  Cotiza y compra aquí → Comprar en línea → Servicios de Integración. El
  precio no es público. Incluye el enrolamiento ante el SII y el diseño
  inicial del impreso.
- Al pagar, llega un correo de bienvenida al **técnico registrado** con las
  credenciales: primero las de prueba y, al final, las de producción. Son
  distintas de la clave de la plataforma web.

**Cómo se emite**
- Eventia arma un **archivo** por documento, en texto plano (TXT) o XML, lo
  manda en Base64 y recibe el folio y el enlace o el PDF.
- Si el archivo trae el correo del cliente, facturacion.cl le manda el
  documento solo, apenas se genera.
- Hay dos puertas:
  - **Servicio web SOAP**: `https://wss.facturacion.cl/WSDS/wsplano.asmx`.
    Es el de siempre y su manual está completo.
  - **API REST**: `https://rest.facturacion.cl`. Su manual es la versión
    1.0, de julio de 2026. El 26-10 el servidor respondió versión 1.2.8.1.

**Pruebas y paso a producción**
- El ambiente de pruebas tiene su propio acceso web, donde se ve lo emitido
  en «Contabilidad/Libro de Ventas».
- La certificación toma de 3 a 5 días hábiles.
- El paso a producción lo pide el técnico con el botón «Solicitar» de la
  plataforma.

**Lo que Felipe hace en facturacion.cl antes de partir**

La plataforma ya funciona. Felipe, 26-10: *"Facturación.cl ya está
funcionando, eso está ok"*. Falta lo de la integración y lo de las
boletas:

- Cargar el **certificado digital** (la firma electrónica) en la
  plataforma. Lo carga él. Eventia nunca lo ve ni lo guarda, porque
  facturacion.cl firma cada documento con ese certificado.
- Dejar listos en facturacion.cl los **folios de boleta**: tipo 39, y 41
  si hubiera boletas exentas. Hasta hoy las boletas salían por Facto, con
  folios cargados en Facto. Hay que preguntarle a soporte cómo se piden y
  se cargan.
- Contratar el Servicio de Integración con su correo como técnico (D2).
- Cuando las boletas de Eventia funcionen, Facto deja de emitir boletas.

## 3. Limitaciones (revisadas el 26-10-2026)

Se revisaron tres fuentes:
- las 17 páginas del manual de integración;
- la definición del servicio web (WSDL), bajada en vivo;
- la respuesta de soporte.

| # | Limitación | Qué significa para Eventia | Cómo se maneja |
|---|---|---|---|
| L1 | La API REST es nueva (julio de 2026) y su manual se contradice. El documento va en un **GET**: unos ejemplos lo ponen en el cuerpo y otros en la dirección. | El `fetch` del motor no permite cuerpo en un GET, y una dirección larga suele tener tope. Una factura con varias líneas podría no caber. | Se usa el **servicio web SOAP**, que va por POST y es el maduro. La REST queda como plan B si en pruebas responde igual. |
| L2 | La REST no consulta folios. Para **facturas**, el manual pide que el folio *"coincida con el folio siguiente almacenado"*. Para **boletas**, basta 0, y la plataforma lo asigna sola. | Sin saber el próximo folio no se puede emitir una factura. | Antes de cada factura se llama a `ConsultarCAF` (SOAP, incluido), que entrega `foliosiguiente`. En el paso 0 se prueba si 0 también sirve para facturas. |
| L3 | Si alguien emite en la plataforma web al mismo tiempo, el folio avanza y la respuesta es *"Ya existe el Documento del TipoDTE = 33 con Folio = N"*. | Choque de folios. | El folio se consulta justo antes de emitir. Si choca, se consulta una vez más; si vuelve a chocar, se avisa. **06-11 (paso 0):** lo mismo si responde *"fuera del rango que tiene autorizado"* (hay varios rangos y usa otro): una vez más, con el folio de otro rango. |
| L4 | No hay una forma incluida de saber si el **SII** aceptó o rechazó un documento. `Procesar` solo dice si facturacion.cl lo generó. `ConsultaLibroVentas` (acuse del cliente) se paga aparte. `ConsultarEstado` existe en el servicio pero no aparece en el manual: es para el envío masivo asíncrono. | Eventia sabe que un documento se emitió, no que el SII lo aceptó. | Eventia lo marca **emitido**, y un rechazo del SII se ve en la plataforma. Hay que preguntarle a soporte por `ConsultarEstado`. La cuadratura se paga solo si hace falta (D7). El SII sí lo informa directo, pero pide el certificado digital (D9). |
| L5 | Si la conexión se corta a mitad, no se sabe si el documento salió. | En las boletas (folio automático), reintentar puede **duplicar**. | Nunca se reintenta solo: el documento queda **«por confirmar»** y se revisa en la plataforma. Las facturas, con folio fijo, no se duplican, porque un folio repetido se rechaza. |
| L6 | Lo emitido no se borra. `EliminarDoc` sirve solo para documentos **no electrónicos**, y `AnularGuia` solo para guías. | Un error queda emitido. | Siempre hay **vista previa y confirmación** antes de emitir. Para anular se emite una **nota de crédito** (tipo 61) que referencia al documento, con código 1. |
| L7 | Límites de texto y de tamaño (detalle abajo). | Un texto largo o con ";" rompe el archivo. | El armador limpia y corta los textos, y la vista previa muestra cómo quedan. |
| L8 | La factura se arma desde el **neto**: IVA = neto × 19%. | Como en Eventia todo va con IVA, puede haber $1 de diferencia. | El armador calcula el neto y el IVA, revisa que el total cuadre y avisa antes de emitir si no cuadra. La boleta va con IVA incluido y no tiene este problema. |
| L9 | El manual no dice cómo deben venir los acentos y la ñ. | «Cabaña» o «Quillón» podrían salir mal. | Se prueba en el paso 0, antes de construir pantallas. |
| L10 | `ObtenerLink` entrega un **enlace público**: quien lo tenga puede bajar el PDF. Además, el PDF existe recién después del envío al SII. | No conviene repartir esos enlaces. | Eventia guarda **su propia copia del PDF** (`ObtenerPdf` en Base64) y lo muestra desde Eventia. Si el PDF todavía no está, se pide más tarde. |
| L11 | Si el archivo trae un correo, facturacion.cl le manda el documento al cliente **solo**. | En las pruebas se podría escribir a un cliente real. | En el ambiente de pruebas, el correo va vacío o con uno de la casa. |
| L12 | Varios servicios se pagan aparte (detalle abajo). | Ninguno es necesario para partir. | Para partir basta con el Servicio de Integración. |
| L13 | La boleta no lleva referencias tributarias: las suyas solo salen impresas, así que no puede referenciar una OC. Si no se conoce al cliente, se usa el RUT auxiliar 66666666-6. | Una empresa con OC necesita factura. | La OC se usa solo en facturas. |
| L14 | El manual no documenta topes de uso, ni por minuto ni por día. | No se sabe cuánto aguanta. | Un documento por llamada; nada masivo. |
| L15 | El proceso de certificación menciona DTEPlanoWS, que es un programa de Windows. | No corre en el Mac. | No hace falta: se valida mandando archivos al ambiente de pruebas. |

**Detalle de L7 (límites de texto y de tamaño)**
- El **";"** está prohibido en los textos, porque separa los campos.
- Descripción de cada línea: 80 letras, más una descripción larga de 1.000.
- Factura: razón social 100, giro 40, dirección 60, comuna 20, ciudad 20 y
  correos 200.
- Boleta: razón social 40 y dirección 70.
- Hasta 60 líneas por factura (1.000 por boleta) y 40 referencias.
- Los montos van en números enteros.

**Detalle de L12 (lo que se paga aparte)**
- el Servicio de Integración;
- `getXMLDte`, `ConsultaLibroVentas` y `LibroVentasDetallado`;
- el ticket térmico (FETICKET/BETICKET);
- la boleta sin conexión;
- el servicio web de compras.

## 4. Decisiones

**Tomadas por Felipe (26-10-2026):**
- **Las boletas y las facturas salen por Eventia a través de
  facturacion.cl.** Hasta hoy, las facturas iban por facturacion.cl, las
  boletas por Facto y las del restaurante por Fudo. Felipe: *"quiero
  empezar a sacar boletas y facturas por Eventia a través de
  facturación.cl"*.
- La ficha del cliente tiene «Datos de facturación»: RUT, razón social,
  giro, dirección, comuna, ciudad y correo.
- La factura referencia la OC *"como se debe"*: código **801** = orden de
  compra, con el N° y la fecha. Además trae la descripción, el monto y el %
  que se factura.
- Recepción emite las boletas de las cabañas.

**Pendientes (con recomendación):**

| # | Pregunta | Recomendación |
|---|---|---|
| D1 | ¿Las boletas del restaurante siguen saliendo por Fudo? | Sí. Fudo es la caja del restaurante, y los dos sistemas pueden convivir si cada uno tiene sus propios folios. |
| D2 | ¿Se compra el Servicio de Integración, y quién queda como técnico registrado? | Sí, con felipe@ como técnico: las claves le llegan a Felipe y él las carga en Railway. |
| D3 | ¿De dónde sale el valor de la boleta de cabaña? Hoy el catálogo no tiene las tarifas de las cabañas: solo «Alojamiento temporada…» por persona y una «Cabaña 3H 2B». | **DECIDIDA el 04-11** (Felipe: *"tarifario aparte puede ser cabañas, ticket diario, otros"*): un tarifario propio de las boletas, fuera del catálogo del cotizador (migración 187, §9.16). Que solo el administrador pueda escribir el monto a mano. |
| D4 | En una factura sin OC, ¿el % se calcula sobre el total del evento? | Sí. |
| D5 | ¿Quién emite cada documento? | Boletas: de recepción hacia arriba. Facturas y notas de crédito: el administrador. |
| D6 | ¿Los eventos de particulares (matrimonios) también se boletean desde la ficha del evento? | Sí, en el paso 3. |
| D7 | ¿Se paga `ConsultaLibroVentas` para cuadrar solos con el libro de ventas? | No al partir; se ve después del primer mes. |
| D8 | ¿El monto de la OC se anota con IVA incluido? | Sí, como todo en Eventia. La OC de Mercado Público trae el neto, el IVA y el total. |
| D9 | **CERRADA el 04-11** (Felipe: *"Si se van al SII, (…) solamente debes tener como resultado de facturación.cl"*): Eventia no le pregunta al SII ni guarda el certificado; guarda lo que responde facturacion.cl. Lo de abajo queda como historia. ¿Eventia le pregunta directo al SII si aceptó cada documento? (Felipe, 27-10.) El servicio `QueryEstDte` del SII recibe el RUT, el tipo, el folio, la fecha y el monto, y responde: recibido (DOK), recibido con datos que no coinciden (DNK), no recibido (FAU), no autorizado (FNA), anulado (FAN), o modificado o anulado por una nota de crédito o débito. Pero exige la «autenticación automática» con un **certificado digital**: Eventia tendría que guardar el certificado y su clave en el servidor. | Al partir, no: Eventia sigue sin ver el certificado. Primero se le pregunta a soporte de facturacion.cl si `ConsultarEstado` entrega el estado del SII. Guardar el certificado en Eventia lo decide Felipe (son sus claves). |

## 5. Cómo funciona en Eventia

### 5.1 Pantallas

**Boletas (recepción)**
- Es una sección nueva del menú, para recepción en adelante.
- El formulario es corto:
  - qué se cobra (cabaña o servicio del tarifario);
  - cuántas noches o unidades;
  - el valor;
  - el correo del huésped, opcional.
- Después viene la vista previa y el botón «Emitir boleta». Al final queda
  el PDF para imprimir o descargar.
- No pasa por un requerimiento.

**Ficha del cliente**
- Tiene una sección nueva, **«Datos de facturación»**: RUT (con dígito
  verificador), razón social, giro, dirección, comuna, ciudad y correos.

**Ficha del evento** (`/negocio/:id`)
- Bloque **«Órdenes de compra»**: N°, fecha, descripción, monto y el PDF si
  lo hay. Con un N° de Mercado Público se llena solo y propone los datos de
  facturación del comprador.
- Botón **«Emitir factura»**:
  - se elige la OC y el %, o el % del total si no hay OC;
  - la vista previa muestra lo ya facturado de esa OC;
  - al emitir, el PDF queda en Documentos → Facturas.
- La casilla `requires_invoice` («pide factura») vuelve a tener uso: si está
  marcada y faltan los datos de facturación, la ficha lo avisa.

**Facturación (administrador)**
- Es la lista de todo lo emitido: boletas, facturas y notas de crédito.
- Tiene filtros, el PDF y el estado de cada documento, y el botón «Anular
  con nota de crédito».

### 5.2 La base de datos

Va en una migración, en las dos bases. El número se toma al construir:
el siguiente libre ese día, avisando a las sesiones de Oportunidades.
La 166 estaba reservada, pero el 27-10 Oportunidades la usó para la
decisión 97 (`por_que` en `oportunidad_generacion`), y se la dejamos.

**`razones_sociales`** (tabla nueva, 04-11; §9.12): a quién se le factura,
VARIAS por cliente, cada una con:
- `rut`;
- `razon_social`;
- `giro`;
- `direccion`;
- `comuna`;
- `ciudad`;
- `correo_facturacion`;
- `referencias_exigidas`, las que pide en su factura.

`clients.address` es un dato muerto y no se reusa.

**`ordenes_de_compra`** (tabla nueva) guarda:
- la empresa y la cotización;
- el N°, la fecha y la descripción;
- a nombre de quién viene (RUT y razón social, como los imprime la OC);
- el monto con IVA;
- el origen (manual o Mercado Público);
- el PDF (opcional);
- quién la creó y cuándo.

**`documentos_tributarios`** (tabla nueva) guarda:
- la empresa;
- el tipo (39, 41, 33, 34 o 61);
- el folio y la fecha;
- el estado: emitido, por confirmar o error;
- los datos del receptor tal como se mandaron al emitir;
- el neto, el IVA, el exento y el total;
- la cotización, y la OC con su %, si los hay;
- el documento que anula, si es nota de crédito;
- el archivo enviado y la respuesta, para auditoría;
- el PDF;
- quién lo emitió.

Es único por empresa, tipo y folio.

Todo lleva `company_id` y las mismas reglas de aislamiento que el resto
(mapa 22).

### 5.3 El motor (módulo `facturacion`)

**La conexión.** `FacturacionClCliente` usa el servicio SOAP: `Procesar`,
`ObtenerPdf`, `ConsultarCAF` y `Online`. Si se puede, sin librerías nuevas:
el sobre SOAP es corto.

**Los armadores.** Son funciones **puras** y llevan pruebas:
- uno para la boleta;
- uno para la factura, con la referencia 801 de la OC, y HES si se pide;
- uno para la nota de crédito.

Todos limpian los ";", cortan los textos, calculan el neto y el IVA y
validan el RUT. En las observaciones del documento ponen el N° de la
cotización y la fecha del evento.

**Las rutas**
- vista previa y emisión de boleta, de factura y de nota de crédito;
- la lista de documentos y el PDF de cada uno;
- las OC de una cotización: crear, editar y leer desde Mercado Público.

**Los candados**
- confirmación explícita antes de emitir;
- un solo envío a la vez por cotización y por OC;
- nunca pasar del 100% de una OC;
- nunca reintentar `Procesar` solo.

**Las credenciales.** Van en variables de Railway, que carga Felipe:
- `FACTURACIONCL_USUARIO`;
- `FACTURACIONCL_RUT`;
- `FACTURACIONCL_CLAVE`;
- `FACTURACIONCL_AMBIENTE` (prueba o producción);
- `FACTURACIONCL_EMPRESA` (sumada el 05-11): el N° de la empresa de
  Eventia dueña de esas credenciales, la 1 para Valle del Sol. Ninguna otra
  empresa emite con ellas (§9.18).

Por ahora hay una sola empresa: Valle del Sol. El laboratorio usa **solo**
las credenciales de prueba; las de producción van solo en el motor de
producción.

**La OC de Mercado Público.** Se reusan `bajarOrdenDeCompra` y
`leerOrdenDeCompra` (`api-rest/src/oportunidades/oferente/orden-de-compra.ts`).
Se amplían para que lean también los «Datos de Pago y Facturación» (razón
social, RUT, dirección de facturación y comuna) y las líneas de la OC. El
giro no viene en la OC.

**Lo que no hace**
- No manda correos: eso lo hace facturacion.cl.
- No lleva contabilidad.
- No reemplaza la plataforma web.

## 6. Pasos (sprints cortos) — reemplazados por el §9.9

**Paso 0. Conexión con el ambiente de pruebas, sin pantallas.**
- Qué se hace: `Online`, `ConsultarCAF`, una boleta y una factura de prueba.
  Se mide:
  - los acentos y la ñ (L9);
  - el folio 0 en facturas (L2);
  - los tiempos;
  - el PDF (L10).
- Qué entrega: una tabla con lo medido.
- Qué necesita:
  - el Servicio de Integración pagado;
  - el certificado digital y los folios de boleta cargados en
    facturacion.cl (§2);
  - las credenciales de prueba cargadas en Railway, en el motor del
    laboratorio.

**Paso 1. Boletas desde recepción, en el laboratorio.**
- Incluye el tarifario si D3 dice que sí, y una prueba de punta a punta en
  el ambiente de pruebas.
- Necesita D3 y D5.

**Paso 2. Facturas con OC.**
- Datos de facturación, órdenes de compra y «Emitir factura» con el 801 y
  el %.
- Incluye la lectura de las OC de Mercado Público.
- Necesita D4 y D8.

**Paso 3. Lista y anulaciones.**
- La lista de Facturación y las notas de crédito para anular.
- La boleta de eventos de particulares.
- Necesita D6.

**Paso 4. Paso a producción.**
- Se aprieta «Solicitar» en facturacion.cl.
- Felipe pega las credenciales productivas en Railway.
- La primera boleta real se emite mirándola juntos.
- Necesita la certificación lista.

**Después, si hace falta**
- la cuadratura automática con `ConsultaLibroVentas` (se paga aparte);
- recibir las facturas de proveedores con el servicio web de compras (se
  paga aparte);
- que otras empresas de Eventia facturen con sus propias credenciales.

## 7. Mapas del atlas que cambian al construir

- 00: el índice.
- 02: la ficha del evento.
- 09: clientes.
- 15: secciones y cargos.
- 18: base de datos.
- 19: las variables de Railway.
- 20: la conexión nueva y su riesgo.
- 22: el aislamiento de las tablas nuevas.
- 24: el lector de OC que se reusa.

## 8. Fuentes

- La respuesta de soporte de facturacion.cl a felipe@ (OT cerrada,
  26-10-2026).
- El manual de integración: https://www.facturacion.cl/manualintegracion/
  Se leyeron la API REST, el servicio web, el TXT de factura y el de boleta,
  el XML, la ficha técnica, las credenciales y DTEPlanoWS.
- La definición del servicio web en vivo:
  https://wss.facturacion.cl/WSDS/wsplano.asmx?wsdl (26-10-2026). Además de
  los métodos del manual, trae `ConsultarCAF`, `ConsultarEstado`,
  `ProcesarWSMasivo`, `AltNum`, `RegIP` y `getIP`.
- El manual del SII para consultar el estado de un DTE (`QueryEstDte`,
  versión 1.10 de 22-12-2010):
  https://www.sii.cl/servicios_online/docs/estado_dte.pdf (leído el
  27-10-2026). Exige la autenticación automática con certificado digital.
- Las referencias: `TipoDTERef` 801 = orden de compra y HES = hoja de
  entrada; `CodigoRef` 0 para las referencias informativas.

## 9. Plan v2 (04-11-2026): la factura con IA, la nota de pedido, las boletas por cabaña y la anulación

> Lo de los §2 a §5 sigue valiendo, salvo donde esta sección lo cambia. Las
> maquetas se mostraron en el chat el 04-11: la factura armada por BelIA
> con la pregunta de la nota de pedido, la vista previa, las boletas por
> cabaña y la lista con las anulaciones en cadena.

### 9.1 Lo que pidió Felipe (04-11)

- *"cuando meto facturación, me debe generar automáticamente con IA la
  factura. En caso de que exista una orden de compra cargada, debe tomar el
  archivo de la orden de compra y poner el detalle (…), el total (…) de la
  orden de compra y referenciar la factura (…) con la orden de compra"*.
- *"Existen algunos casos como CCU que piden, además del número de orden de
  compra, la nota de pedido, y eso no siempre está en la orden de compra
  (…) hay que hacer alguna pregunta"*.
- *"la recepcionista debería poder ver el módulo de facturación para poder
  hacer la emisión de boletas (…) de las cabañas (…) que yo le pueda
  colocar como el total y que ella coloque la facturación por cabaña"*.
- *"El resto lo vemos nosotros desde el evento. Debe ser algún botón de un
  evento ya realizado o previo a realizar"*.
- *"dejar al tiro resuelto el circuito para (…) anular las facturas con
  notas de crédito y anular las notas de crédito con notas de débito"*.
- *"Si se van al SII, entonces ahí solamente debes tener como resultado de
  facturación.cl"*: **la D9 queda cerrada** (§4).
- *"Cuando una factura se anule, debería quedar anulada y también debería
  quedar como vinculada a su crédito, cosa de poder ver cuál va con cuál en
  caso de algún reporte"*.
- *"sería bueno quizás que fuéramos desarrollando, avanzando esto, y luego
  lo montamos"*.

### 9.2 La factura la arma BelIA, desde el evento

> Desde el 05-11 la pestaña es «Emitir DTE» (§9.20): la factura o la
> boleta, con sus líneas (descripción, personas y precio con IVA). BelIA
> lee sola las OC de Documentos al abrirla, y el % del evento dejó de ser
> una casilla: el monto lo dan las líneas. Lo demás de esta sección sigue
> valiendo para la factura.

**Dónde y quién.** En la pestaña «Facturación» de la ficha del evento, con
el evento aceptado (antes de hacerse) o ya realizado. La emite el
administrador (D5).

**Lo que hace BelIA** (una sola IA, doc 20 §15):
1. Lee la cotización, los datos de facturación del cliente y las órdenes de
   compra de Documentos (`ordenes_compra`). La lectura del PDF es la que ya
   usa Oportunidades para los respaldos de Post-venta
   (`oportunidades/oferente/respaldos-de-post-venta.ts` y
   `EventiaRepository.documentosDeExperiencia`).
2. Arma el borrador:
   - **con OC:** el detalle es el de la OC; el neto, el IVA y el total son
     los de la OC; va la referencia 801 con su N° y su fecha;
   - **sin OC:** el detalle sale de la cotización («Servicio de [tipo] del
     [fecha], [N] personas, según cotización N° X»), por el % del total
     que se elija (D4).
3. Pregunta lo que falta: una referencia que el cliente exige y no está en
   la OC (CCU: la nota de pedido, 802), o un dato de facturación (el giro,
   la comuna). Lo que se responde queda guardado: la próxima vez ya sabe
   que CCU pide nota de pedido.
4. Muestra la vista previa igual al PDF, con lo ya facturado de esa OC y los
   avisos (la OC no calza con la cotización, la OC ya está al 100 %…).

**Lo que BelIA no hace:** emitir sola, poner montos que no salgan de la OC o
de la cotización, ni inventar un N° de referencia. Cada dato dice de dónde
salió: la OC, la ficha del cliente o la persona.

**Al emitir:**
- el folio y el PDF en Documentos → Facturas;
- la nota de BelIA en la bitácora («A pedido de Felipe Vargas: emitió la
  factura N° 1235 por $5.355.000, OC 4500918822»);
- el estado que devuelve facturacion.cl.

### 9.3 Las referencias (formato DTE del SII, versión 2.2)

| Código | Qué es | Cuándo |
|---|---|---|
| 801 | Orden de compra | Siempre que haya OC (también la de Mercado Público) |
| 802 | Nota de pedido | Si el cliente la pide (CCU) |
| 803 | Contrato | Si el cliente factura contra un contrato |
| HES | Hoja de entrada de servicio | Si el cliente la pide. Es un código propio: el SII no lo valida |
| 805 y 806 | Proceso y ficha ChileCompra | Opcionales en compras públicas |
| 33, 61 y 56 | Factura, nota de crédito y nota de débito | En las notas del circuito de anulación (§9.5) |

- Caben hasta 40 referencias por documento. El N° de la referencia admite
  hasta 18 letras o números, y la razón hasta 90.
- **Lo que pide cada cliente** queda en su ficha («Referencias que pide»).
  Si al facturar falta una, BelIA la pregunta.

### 9.4 Recepción: las boletas de las cabañas

- Sección «Boletas» en el menú, de recepción hacia arriba (D5). Recepción no
  ve las facturas ni los montos de los eventos: solo lo que tiene que
  boletear.
- **Por boletear.** El administrador deja un cobro con su total, desde el
  evento (el alojamiento de una delegación) o suelto. Recepción lo reparte
  por cabaña, con el correo del huésped si lo da, y emite una boleta por
  cabaña. Eventia no deja emitir si lo repartido no suma el total.
- **Boleta suelta.** La cabaña y las noches, con el valor del tarifario
  (D3). Escribir un monto a mano es solo del administrador (las reglas de
  la casa: los precios nunca a dedo).
- **La boleta:** tipo 39, con IVA incluido y sin referencias (L13). Lleva el
  RUT 66666666-6 si el huésped no da el suyo. Si va su correo,
  facturacion.cl se la manda sola.
- Desde agosto de 2022 el SII no pide el resumen diario de boletas (L18):
  «Emitidas hoy» es solo control de la casa.

### 9.5 El circuito de anulación

Nada se borra (L6). Cada nota referencia **un solo** documento y queda
amarrada a él en Eventia.

| Para | Se emite | Código de referencia | Monto |
|---|---|---|---|
| Anular una factura completa | Nota de crédito (61) | 1: anula | El total de la factura |
| Rebajar una parte (devolución, menos personas) | Nota de crédito | 3: corrige montos | Lo que se rebaja |
| Corregir un texto (el giro, la dirección) | Nota de crédito | 2: corrige texto | $0 |
| Anular una nota de crédito | Nota de débito (56) | 1: anula | El de la nota de crédito |
| Anular una nota de débito | Nota de crédito | 1: anula | El de la nota de débito |
| Devolver una boleta | Nota de crédito que referencia la boleta (39) | 1 o 3 | Lo devuelto (se prueba en el paso 0, L21) |

**Los plazos del SII**
- Para anular un error propio: el mismo mes o el siguiente (Res. Ex. 45 de
  2003). Después, el débito ya pagado solo se recupera con una petición
  administrativa (formulario 2117).
- Para rebajar por devolución o por término del contrato: hasta 6 meses
  (Ley 21.398, arts. 21 y 70 de la Ley del IVA). Después, la nota sale
  «sin derecho a rebajar el débito» (`IndNoRebaja` = 1).
- Eventia muestra el plazo en el botón y avisa antes de que venza.

**Cómo queda en Eventia**
- Cada documento guarda cuál modifica (`modifica_id`) y con qué código.
- El estado sale de la cadena:
  - una factura queda vigente, rebajada (con lo que le queda), corregida o
    **anulada por la NC N° …**;
  - una nota de crédito queda vigente o **anulada por la ND N° …**.
- La lista de Facturación muestra la cadena (factura → NC → ND). El reporte
  la exporta con dos columnas: el documento y el que lo anuló o rebajó.
- Una nota nunca pasa del saldo de lo que modifica: las notas de crédito de
  una factura no suman más que su total.
- Si un evento se anula con reembolso (Post-Venta), la ficha propone la nota
  de crédito de su factura.

### 9.6 Lo que hacen los facturadores grandes, y lo que toma Eventia

| Práctica | Dónde se ve | En Eventia |
|---|---|---|
| Borrador y vista previa igual al PDF antes de emitir | Bsale, Nubox, Defontana | Sí |
| Una clave única por emisión, para que un reintento no duplique | Bsale (`salesId`) | Sí: una por borrador. Si se corta, «por confirmar» (L5) |
| Referencias como lista, con el código del SII | Bsale (`references` con `codeSii` 801) | Sí (§9.3) |
| El documento llega solo al correo del cliente | Bsale (`sendEmail`), facturacion.cl | Sí: lo manda facturacion.cl (L11) |
| El estado ante el SII de cada documento | Bsale (`informedSii` y `responseMsgSii`) | Solo lo que diga facturacion.cl (D9 cerrada) |
| Nunca se borra: se anula con nota de crédito, y la de crédito con una de débito | SII, Nubox, LibreDTE | Sí (§9.5) |
| Facturación parcial contra la OC, con el saldo a la vista | Defontana, Bsale | Sí: % por OC, nunca más del 100 % |
| Datos del cliente validados (RUT con dígito verificador) | Todos | Sí |
| Aviso de folios por agotarse | Facto, Bsale | Sí, en la lista |
| Lectura de la OC con IA, con confirmación | Lo nuevo | Sí: cada dato con su origen, y la persona confirma |

### 9.7 Limitaciones nuevas

| # | Limitación | Cómo se maneja |
|---|---|---|
| L16 | El manual REST sigue en la versión 1.0 de julio de 2026 (releído el 04-11): no documenta referencias ni notas, y el archivo sigue yendo en un GET (L1). | Se sigue con el SOAP. |
| L17 | Una OC que trae solo el total con IVA puede no cuadrar al peso con el neto más el IVA (L8). | Se usan el neto y el IVA de la misma OC. Si no los trae, se calculan y se avisa si queda $1 de diferencia. |
| L18 | El SII eliminó el resumen diario de boletas desde el 01-08-2022 (Res. Ex. 53 de 2022). | No hay nada que mandar; el cierre del día es solo control interno. |
| L19 | La IA puede leer mal un N° o un monto de una OC escaneada. | Nunca emite sola. Cada dato muestra su origen, y los montos tienen que cuadrar con los totales de la misma OC. |
| L20 | Los plazos del SII para anular y rebajar (§9.5). | Eventia muestra el plazo y avisa antes. |
| L21 | No se sabe si facturacion.cl acepta por el TXT la nota de crédito de una boleta, ni la nota de débito que anula una nota de crédito. | Se prueba en el paso 0, antes de construir esas pantallas. |
| L22 | En la boleta, el manual pide el neto y el IVA solo cuando las líneas van en neto. Las de la casa van con IVA (IndMntNeto 0). | El armador los deja vacíos y la vista previa muestra el desglose. Se confirma en el paso 0. |
| L23 | Las páginas del manual vienen en latin-1 aunque dicen UTF-8: el archivo seguramente también va en latin-1 (L9). | El armador entrega el texto; la codificación la pone la conexión y se prueba en el paso 0 con «Cabaña» y «Quillón». **05-11:** el manual del XML pide ISO-8859-1 (latin-1); la conexión manda el TXT igual, y lo que no cabe en latin-1 (un emoji, otro alfabeto) se quita con aviso en la vista previa. Se confirma en el paso 0. |
| L24 | El manual no dice si el código de la línea puede ir vacío. | Sin código va «SERV». Se confirma en el paso 0. |
| L25 | La fórmula del manual para lo exento es ambigua (el valor de la línea suma el exento). | La factura exenta (34), la boleta exenta (41) y las líneas exentas no se arman todavía. Se prueban en el paso 0. |
| L26 | El manual del TXT no nombra `IndNoRebaja` (la nota que rebaja después de los 6 meses sale sin derecho a rebajar el débito). | La nota se emite igual y la vista previa lo avisa. Se confirma en el paso 0. |

### 9.8 Decisiones nuevas (tomadas por Felipe el 04-11)

| # | Pregunta | Decisión de Felipe |
|---|---|---|
| E1 | Con OC, ¿la factura va siempre por el total de la OC, aunque la cotización diga otra cosa? | *"si siempre por el total"*. La vista previa avisa la diferencia con la cotización. |
| E2 | ¿Qué referencias pide cada cliente? | Se aprenden al facturar: la primera vez se pregunta y queda en la ficha (CCU: la OC y la nota de pedido). |
| E3 | Boletas de cabañas: ¿el administrador deja el total y recepción solo lo reparte? | *"debe ser editable"*: el total y lo de cada cabaña se pueden cambiar en la pantalla, y queda anotado quién cambió qué. |
| E4 | ¿Se puede facturar antes del evento, o por otro monto? | *"si un % pero debe quedar el registro (…) también puede ser que se facture un monto diferente al evento y eso no debería ser una limitante, debe mandar la OC, y finalmente ser editable a mano, Belia arma todo y luego se confirma a mano"*. Se factura por un % o por un monto, sin tope contra el total del evento. Si hay OC, manda la OC. Todo es editable a mano antes de emitir, y queda el registro de lo facturado contra el evento y contra la OC. Desde el 05-11 (§9.20), el monto lo dan las líneas del DTE (cantidad por precio con IVA), editables a mano; el % y «un monto» dejaron de ser casillas, y el % de la OC o del evento queda calculado en el documento |
| E5 | ¿Quién anula? | *"solo el administrador"*: las notas de crédito y de débito. |

Felipe cerró con *"si avanza así"*: se parte con el paso 1 del §9.9.

### 9.9 Pasos v2 (sprints cortos)

Felipe: *"que fuéramos desarrollando, avanzando esto, y luego lo
montamos"*. Los pasos 1 a 4 se construyen en el laboratorio con
facturacion.cl **simulado**: responde como dice el manual y no emite nada.
La conexión de verdad es el paso 5.

| Paso | Qué | Necesita |
|---|---|---|
| 1 | **1a, en el laboratorio desde el 04-11** (migración 184): «Datos de facturación» y «Referencias que pide» en la ficha del cliente, y las tablas. **1b, pendiente:** los armadores y el simulado. Los datos: «Datos de facturación» y «Referencias que pide» en la ficha del cliente; las tablas de OC y de documentos tributarios, con su cadena (`modifica_id`); los armadores puros del TXT (factura con referencias, boleta, nota de crédito y de débito) con sus pruebas; y facturacion.cl simulado. | Nada de afuera. |
| 2 | La factura con BelIA en el evento: la lectura de la OC, las preguntas, la vista previa y «Emitir» (simulado). En tres tramos: **2a** las OC del evento a mano (hecho el 04-11, §9.14); **2b** BelIA lee el PDF de la OC y llena sus datos para confirmarlos (hecho el 04-11, §9.14); **2c** la factura armada, la vista previa y «Emitir» (hecho el 04-11, §9.15). | E1, E2 y E4. |
| 3 | Las boletas de recepción: el cobro por boletear repartido por cabaña y la boleta suelta con el tarifario. En dos tramos: **3a** «Por boletear» con el reparto por cabaña y «Emitidas hoy» (hecho el 05-11, §9.16); **3b** la boleta suelta y el tarifario (hecho el 05-11, §9.16). | D3 (decidida el 04-11) y E3. |
| 4 | La lista de Facturación, la cadena y el circuito de anulación (notas de crédito y de débito), con los plazos y el reporte (hecho el 05-11, §9.17). | E5. |
| 5 | La conexión de verdad: el paso 0 del §6 (el ambiente de pruebas de facturacion.cl) y la certificación. Con el «a producción», las credenciales productivas y la primera boleta y factura reales, mirándolas juntos. **5a, hecho el 05-11 (§9.18):** la conexión por SOAP, dormida hasta las credenciales, con «Probar la conexión» y los candados de los ambientes. | El Servicio de Integración pagado (D2); el certificado y los folios de boleta cargados en facturacion.cl; las credenciales en Railway (las carga Felipe). |

### 9.10 El desafío: integrarse bien a facturacion.cl

Felipe, 04-11: *"nosotros facturamos a través de facturación.cl (…) ellos
resuelven con el servicio (…) internos. Nuestra dificultad o nuestro
desafío tecnológico es integrarnos bien a la API de facturación.cl y qué
cosas podemos hacer nosotros a nivel de interfaz y de usabilidad con las
limitaciones que tiene esta API"*.

Eventia habla **solo** con facturacion.cl, y facturacion.cl firma, numera y
se entiende con el SII. Cada límite de su API tiene su respuesta en la
pantalla:

| Lo que la API no da | Lo que hace la pantalla de Eventia |
|---|---|
| Ni borrador ni vista previa: `Procesar` emite al tiro (L6) | La vista previa se arma en Eventia, igual al PDF, y nada sale sin «Emitir» |
| El folio de la factura hay que saberlo antes, y choca si alguien emite en la web (L2, L3) | Eventia pide el folio justo antes de emitir. Si choca, prueba una sola vez más y avisa |
| Si la conexión se corta, no se sabe si salió (L5) | Queda «por confirmar» con el botón «Comprobar»: Eventia mira si el folio avanzó y trae ese documento para compararlo. Nunca reintenta solo |
| No dice si el SII lo aceptó (L4) | La pantalla dice «Emitida por facturacion.cl», nunca «aceptada por el SII» (D9 cerrada) |
| No se puede borrar (L6) | El circuito de anulación del §9.5, con la cadena y los plazos a la vista |
| El PDF sale después y su enlace es público (L10) | Eventia trae su propia copia y la vuelve a pedir sola si todavía no está; mientras, dice «PDF en camino» |
| Si va un correo, facturacion.cl lo manda solo (L11) | Antes de emitir, la vista previa dice a qué correo llegará. En el laboratorio va vacío |
| Textos con tope y sin «;» (L7) | Los campos se limpian y se cortan con su contador, y la vista previa muestra cómo quedan |
| Montos enteros; el IVA se calcula desde el neto (L8, L17) | Neto, IVA y total cuadrados en pantalla, y aviso si queda $1 de diferencia |
| Sin topes de uso documentados (L14) | Un documento a la vez: el botón queda en «Emitiendo…» hasta la respuesta |
| La boleta no lleva referencias (L13) | Si hay OC, Eventia ofrece factura, no boleta |
| El ambiente de pruebas es otro (§2) | En el laboratorio, un letrero «Modo prueba» en todo Facturación |

Lo que suma Eventia sobre la plataforma web de facturacion.cl: el borrador
armado por BelIA desde la OC, las referencias que pide cada cliente, todo
amarrado al evento y a sus pagos, la cadena de anulaciones para los
reportes, y la pantalla corta de recepción.

### 9.12 Un cliente, varios RUT (Felipe, 04-11, en la tarde)

Felipe: *"si tenemos OC cargada los datos de facturación Belia los debería
extraer directo de ahí, si no preguntarlos antes de facturar y luego
guardarlos (…) es posible como en CCU que algunas facturas sean a un rut y
otras a otro (…) ve el caso santo tomas tiene 3 OC a 2 rut por 1 evento"*.

**El caso, medido en producción el 04-11 (evento #481, solo lectura).** En
Eventia es un solo cliente, «Instituto Profesional Santo Tomás»:

| OC | La emite | RUT | Factura |
|---|---|---|---|
| 1 de 3 (menú) | Corporación Centro de Formación Técnica Santo Tomás | 65.175.242-6 | N° 375, con la dirección de Talca y no la impresa en la OC |
| 2 de 3 (carro de palomitas) | La misma corporación del CFT | 65.175.242-6 | Sin factura todavía |
| 3 de 3 (menú) | Corporación Instituto Profesional Santo Tomás | 65.175.239-6 | N° 374 |

- Las dos facturas van por menos que su OC (E4) y con el giro «EDUCACION»:
  el de la OC («853202-ENSEÑANZA SUPERIOR EN CENTROS DE FORMACION
  TECNICA») pasa de los 40 caracteres.
- El evento trae el «Instructivo para facturar» de Santo Tomás: la
  referencia 801 lleva **solo el N° de la OC**, sin texto agregado, con la
  fecha de la OC.

**Lo que cambia (decidido el 04-11; Felipe: *"si vamos avancemos"*):**
- Un cliente tiene una **lista de razones sociales**: RUT, razón social,
  giro, dirección, comuna, ciudad, correos y referencias que pide. Reemplaza
  al juego único de datos del paso 1a. La tarjeta «Datos de facturación» de
  la ficha muestra la lista.
- Cada OC guarda a nombre de quién viene (el RUT y la razón social leídos de
  la OC). La factura de esa OC va a ese RUT.
- **Con OC:** BelIA saca los datos de la OC. Si ese RUT ya está en la lista
  del cliente, usa lo guardado: lo confirmado manda sobre lo impreso en la
  OC (la dirección de Talca de la N° 375). Si no está, propone lo de la OC,
  la persona lo confirma y al emitir queda guardado.
- **Sin OC:** con una sola razón social, va esa; con varias, BelIA pregunta
  a cuál; sin ninguna, pregunta los datos antes de facturar y los guarda.
- La migración 184 se rehízo antes de producción, con `razones_sociales`.
  En el laboratorio, la `184b` (solo laboratorio) mudó los datos de prueba
  de CCU a la lista y quitó las columnas de la primera versión: no se perdió
  nada.

### 9.13 Lo que quedó del paso 1b (04-11)

En `api-rest/src/facturacion/`, sin rutas ni pantallas todavía:

| Pieza | Qué hace |
|---|---|
| `archivo/factura.ts` | Arma el archivo de la factura (33), con sus referencias (801, 802, 803, 805, 806, HES), y de las notas de crédito (61) y de débito (56). Revisa lo que pide el SII: en la factura, la razón social, el giro, la dirección y la comuna; toda nota modifica UN documento y dice cómo (1, 2 o 3); la que anula o corrige un texto lleva una sola referencia; la que corrige un texto va en $0; la de débito solo anula una nota de crédito. |
| `archivo/boleta.ts` | Arma la boleta (39): folio 0, «ventas y servicios», líneas con IVA, el RUT auxiliar 66666666-6 sin el del huésped y su correo si lo da. |
| `archivo/montos.ts` | El neto, el IVA y el total como el SII (L8): el IVA desde el neto y, para un total con IVA, el neto que más se acerca y cuánto se aleja. |
| `archivo/texto.ts` | Limpia los textos (sin «;» ni saltos), corta lo que no cabe y lo AVISA: la vista previa muestra cada corte. |
| `facturacion-cl/facturacion-cl.ts` | La interfaz con facturacion.cl: `enLinea`, `folioSiguiente`, `procesar` (nunca reintenta: si se corta, `EnvioSinRespuesta` = «por confirmar») y `obtenerPdf`. |
| `facturacion-cl/simulado.ts` | facturacion.cl simulado: revisa el archivo como el manual (campos, orden, totales), sigue la numeración de la base, rechaza el folio repetido con el mensaje de L3 y entrega un PDF que dice «SIMULADO». |

- Los armadores no leen la base ni llaman a nadie: reciben los datos ya
  confirmados y devuelven el archivo con sus avisos, o la lista de lo que
  falta.
- Las pruebas usan la factura N° 374 de Santo Tomás (neto $2.201.621, IVA
  $418.308, total $2.619.929), y todo lo armado pasa la revisión del
  simulado.

### 9.14 Lo que quedó del paso 2a (04-11)

- **La pestaña «Facturación» de la ficha del evento** (`/post-venta/:id`,
  `FacturacionTab.tsx`), entre Documentos y Servicios. La ven operaciones y
  el administrador, y solo la empresa con el módulo propio `facturacion`
  (migración 184, la empresa 1): sin él ni se nombra.
- **Las órdenes de compra del evento**: el N° (hasta 18), la fecha, a nombre
  de quién viene (una de las razones sociales del cliente, u otra con su
  RUT), el total con IVA, el neto y el IVA si la OC los trae, el detalle y
  su PDF de Documentos. Agregar, editar y quitar.
- **Las rutas**: `GET`, `POST`, `PATCH` y `DELETE
  /quotations/:id/ordenes-de-compra` (`api-rest/src/facturacion/`). Revisan
  que la cotización sea de la empresa, que el PDF sea de los documentos del
  mismo evento y que la fecha exista. La misma OC dos veces en un evento, o
  quitar una con documentos tributarios, responde 409 con palabras.
- **«✨ Leer con BelIA» (paso 2b).** Arriba de la lista, los PDF de órdenes
  de compra de Documentos que todavía no son una OC. BelIA (Haiku, unos
  US$0,002 por documento, como los respaldos de Oportunidades) lee el PDF
  con una estructura fija y llena el formulario: el N°, la fecha, el
  comprador (su RUT y razón social, nunca los de la propia empresa), los
  montos y el detalle. Arriba del formulario, en ámbar, los avisos (un RUT
  que no es válido, un neto con IVA que no cuadra con el total, un N° de
  más de 18, la OC ya cargada) y lo que dice la OC del comprador (giro,
  dirección, comuna) y de otras referencias (la nota de pedido). Nada se
  guarda solo: la persona revisa y guarda (L19), y la OC queda con origen
  «pdf». La ruta: `POST /quotations/:id/ordenes-de-compra/leer`.
- **El detalle es solo la descripción** (Felipe, 08-11: *"en descripción
  puso más del texto que trae la descripción de la OC"*). Se pedía «qué se
  compra, en una o dos frases», y BelIA juntaba la descripción con las
  otras columnas: «ALMUERZO QUILLÓN SINDICATOS, 1,000 SRV, fecha de
  entrega 26.10.2026.» en la #554, y lo mismo en las 8 OC leídas en
  producción. La factura copia ese texto tal cual. Desde el 08-11 se pide
  solo el texto de la descripción de cada línea (en Mercado Público, el
  producto y la especificación del comprador), sin cantidad, unidad,
  precio, fecha ni lugar de entrega, nombre de la orden, notas ni
  referencias a otros documentos; varias líneas, separadas por « · ».
  Lo cubre `leer-orden-de-compra.spec.ts`. Probado en el laboratorio con
  tres OC de verdad (la #423, la #384 y la #473, sin guardar). **En
  producción desde el 08-11-2026** (PR #318, solo el motor). Las 8 ya
  leídas se corrigen con la misma regla, con el OK de Felipe sobre cómo
  quedan.

### 9.15 Lo que quedó del paso 2c (04-11, en la noche)

**En la pantalla** (pestaña «Facturación», como las maquetas del 04-11):
- **«Facturar»** en cada OC, y **«Facturar sin OC»** (un % o un monto del
  evento, D4 y E4). Abre el **borrador de BelIA**: de dónde leyó (el PDF de
  la OC, la cotización, la ficha del cliente), el total de la OC con lo ya
  facturado y el % de esta factura, el receptor, el detalle, el neto y el
  IVA, y las referencias.
- **Lo que falta se pregunta en ámbar**, ahí mismo: la referencia que pide el
  receptor y no viene en la OC (CCU: la nota de pedido, con su N° y su
  fecha, y «Pedírmela siempre en las facturas de CCU»); el giro, la
  dirección o la comuna de un RUT nuevo; a cuál razón social va si no hay
  OC y el cliente tiene varias. El aviso «Falta N datos» se va cuando está
  todo.
- **«Editar a mano»** abre todo (E4): el receptor con sus contadores, el
  detalle (la glosa de 80 y la descripción larga de 1.000), el monto (un %
  o un monto con IVA) y las referencias (agregar, quitar y «siempre»).
- **«Ver cómo sale»** muestra la factura tal como saldrá: el emisor, el N°
  que sigue, el receptor, el detalle, las referencias, la observación
  (cotización y fecha del evento) y los totales, con «Emitir factura» solo
  para el administrador (D5).
- **«Documentos emitidos»** abajo, con el PDF. Arriba, el letrero «Modo
  simulado» mientras no esté la conexión de verdad (§9.10).

**En el motor** (`api-rest/src/facturacion/facturas/`):
- `borrador.ts` (puro): `armarBorrador` propone desde la OC y el evento, y
  `revisarFactura` revisa lo que falta, los largos de la factura (lo que se
  guarda en la ficha cabe entero), nunca más del 100 % de una OC (con $1 de
  redondeo), los avisos de E1 (las OC no suman lo de la cotización) y E4
  (lo facturado pasa el total del evento) y arma el archivo con
  `armarFactura`. La vista previa y la emisión pasan por la MISMA revisión.
- Las rutas: `GET /quotations/:id/facturas` (lo emitido y el ambiente),
  `POST …/borrador`, `POST …/revisar` y `POST …/emitir` (solo el
  administrador).
- **Emitir:** el registro en `enviando` (uno a la vez por evento), el folio
  que sigue, `procesar` sin reintentos (si se corta, «por confirmar», L5;
  si el folio ya existe, otro folio una sola vez, L3) y `emitido` con la
  respuesta. Después, sin tumbar la factura si algo falla: la copia del PDF
  en Documentos → Facturas, la razón social en la ficha (nueva, o completada
  con lo que le faltaba y las referencias «siempre») y la nota de BelIA en
  la bitácora («A pedido de …: emitió la factura N° … por $… a …, OC …»).
- `conexion.ts`: la conexión de cada empresa. En los pasos 1 a 4, siempre
  el simulado, siguiendo la numeración de la base en el ambiente
  `simulado`.

**Lo que se sumó a los pasos 2a y 2b:**
- La OC guarda **lo que BelIA leyó del comprador** (`comprador`: giro,
  dirección, comuna y ciudad; la 184 suma la columna, todavía no está en
  producción). La primera factura a un RUT nuevo lo propone.
- Medido en el laboratorio con la OC de Mercado Público de la Municipalidad
  de Quillón: la orden no trae «Dirección del demandante», pero sí
  «Dirección de envío factura». BelIA ahora toma esa cuando no hay otra
  (§5.3: «la dirección de facturación y comuna»). El giro no viene en las OC
  de Mercado Público: se pregunta.

**Queda para después:** «Comprobar» una factura por confirmar y volver a
pedir un PDF que no llegó (paso 4, con la lista de Facturación); que las
notas de crédito resten de lo facturado de la OC (paso 4).

### 9.16 El paso 3: las boletas de recepción (04-11 y 05-11)

**Lo que decidió Felipe (04-11, en la noche):**
- **D3:** *"tarifario aparte puede ser cabañas, ticket diario, otros"*. Un
  tarifario propio de las boletas (`tarifario_de_boletas`), fuera del
  catálogo del cotizador. Lo medido en producción ese día: el catálogo
  tiene el alojamiento **por persona** (temporada baja $18.000, media
  $22.000 y alta $28.000), las tinajas ($30.000 las 4 horas) y una «Cabaña
  3H 2B» desactivada; no hay tarifa por cabaña y noche.
- **La cabaña la escribe recepción** (*"Recepción la escribe"*): texto
  libre, sin una lista de las 14 cabañas.

**3a, hecho el 05-11** (migración 187; maqueta del 04-11):
- **En el evento** (pestaña Facturación): «Por boletear» con «Dejar para
  boletear» (solo el administrador: qué se cobra, hasta 55, y el total con
  IVA) y lo que va boleteado de cada cobro.
- **La sección «Boletas»** del menú, de recepción hacia arriba (D5) y solo
  con el módulo propio `facturacion` (sin él, el ítem sale con candado como
  Oportunidades). «Por boletear»: cada cobro con «Total puesto por …», lo
  boleteado y lo que falta, y sus cabañas (la cabaña hasta 22, el monto y
  el correo del huésped). Se guarda al salir de cada casilla. «Emitir N
  boletas» se prende solo cuando lo repartido suma el total, y pide
  confirmación. «Emitidas hoy»: las boletas del día y su total (L18).
- **E3:** el total y cada cabaña se cambian antes de emitir, y cada cambio
  queda en `cobros_por_boletear_cambios` con el antes, el después y quién
  («Ver cambios»). Lo que ya tiene boleta no se toca, el total no baja de
  lo boleteado y un cobro con boletas no se borra.
- **Una boleta por cabaña** (39, folio 0, con IVA, el RUT 66666666-6 y el
  correo del huésped si lo dio): la glosa es la cabaña y el cobro
  («Cabaña 8 · Delegación Vilcún · alojamiento 12 al 15-11»), que cabe
  entera en 80. Cada una con los candados de la factura: `enviando` antes
  de mandarla, la cabaña amarrada a su boleta ANTES de `procesar` (un corte
  no la emite dos veces), sin reintentos (si se corta, «por confirmar» y se
  detiene) y, si facturacion.cl la rechaza, la cabaña vuelve a quedar por
  emitir. El PDF va a Documentos → Facturas del evento.
- En el motor, `api-rest/src/facturacion/boletas/`, y la copia del PDF
  compartida con la factura en `facturas/copia-del-pdf.ts`.

**3b, hecho el 05-11:**
- **«Tarifario»** (pestaña de «Boletas», solo el administrador): cada ítem
  con su nombre (hasta 60, sale en la boleta), su precio con IVA y su unidad
  (noche, persona, día, hora o unidad), «Activo», editar y quitar. Una
  boleta guarda su propia copia de lo cobrado: cambiar o quitar un ítem no
  cambia ninguna boleta emitida. Parte vacío: los precios los pone Felipe.
- **«Boleta suelta»** (recepción hacia arriba): una o varias líneas del
  tarifario por su cantidad (la descripción larga dice «2 noches»), la
  cabaña que escribe recepción (va al comienzo de la descripción de cada
  línea, «Cabaña 4 · …»: el PDF de la boleta no imprime las observaciones,
  paso 0 del 06-11) y el
  correo del huésped si lo da. El total sale del tarifario; «Emitir boleta»
  pide confirmación. «Línea a mano» (qué se cobra y su monto) es solo del
  administrador: el motor la rechaza a los demás (D3, los precios nunca a
  dedo).
- La boleta suelta pasa por la misma emisión que las del reparto
  (`emitirBoleta`): `enviando`, sin reintentos, «por confirmar» si se corta
  y la copia del PDF, que sin evento va a `c<empresa>/documentos-tributarios/`.
  Sale también en «Emitidas hoy».
- Las rutas, en `api-rest/src/facturacion/boletas/`: `GET`, `POST`, `PATCH`
  y `DELETE /boletas/tarifario` y `POST /boletas/sueltas`.

### 9.17 El paso 4: la lista de Facturación y las notas (05-11)

Como la maqueta del 04-11 («la lista de Facturación muestra cada factura con
la nota de crédito que la anuló o rebajó, y la nota de débito que anuló a
esa nota, en cadena»). Solo el administrador (E5).

**La sección «Facturación»** del menú (`/facturacion`):
- Arriba, lo facturado del mes neto de notas de crédito, cuántos documentos
  (facturas, boletas y notas) y cuántos esperan «Comprobar». El mes se
  elige; los filtros son Todo, Facturas, Boletas y Notas.
- Cada documento con su estado en la cadena: la factura «Vigente»,
  «Rebajada: queda $…», «Corregida por NC …» o «Anulada por NC …»; la nota
  «Código 1 · 04-11» o «Anulada por ND …». Las notas van debajo de lo que
  modifican (factura → NC → ND). Una factura de la misma OC que reemplaza a
  una anulada dice «reemplaza a la …». Una nota anulada no cuenta: si la ND
  anula la NC, la factura vuelve a quedar entera (`notas/cadena.ts`).
- «Anular o rebajar…» en una factura abre el panel de la maqueta: «Anular
  completa» (NC por el total, código 1), «Rebajar un monto» (NC parcial,
  código 3, nunca más de lo que le queda) o «Corregir un texto» (NC en $0,
  código 2, con el receptor como debe decir). En una NC, «Anular…» la anula
  con una nota de débito; en una ND, con una de crédito. Cada nota lleva
  UNA referencia con su código y el motivo como razón (90). La ND le
  devuelve a la factura lo que la NC anuló o rebajó: si esa OC ya se volvió
  a facturar, no sale (nunca más del 100 %, §5.3); primero se anula la
  factura que la reemplazó (05-11, encontrado al probar).
- **Los plazos del SII** se ven en el panel: para anular o corregir, el mes
  de la factura o el siguiente; para rebajar, 6 meses. Si venció, «Ver cómo
  sale» lo avisa: la nota sale igual, pero el débito ya pagado solo se
  recupera con el formulario 2117, o la rebaja sale sin derecho a rebajar
  el débito.
- «Comprobar» (L5): lo que se cortó al mandarlo. Si en facturacion.cl el
  folio ya pasó el que se mandó (el del archivo; en la boleta, el que le
  tocaba, guardado al mandarla), salió con ese folio; si no, «No salió» y se
  puede emitir de nuevo (la cabaña de un cobro vuelve al reparto).
- «Pedir el PDF» si la copia no llegó (L10), y «Reporte (CSV)»: el mes con
  cada documento y su estado (el que lo anuló o rebajó), con `;` y acentos
  que Excel abre bien.

**Lo facturado ahora sigue la cadena:** cada factura vale lo que le queda.
Una OC con su factura anulada se puede volver a facturar, y el tope de la OC
cuenta las rebajas. También en la pestaña Facturación del evento: el motor
le entrega lo facturado de cada OC (`facturado_por_oc`, la misma cuenta del
candado) y el estado de cada documento en la cadena («Anulada por NC 1», y
en cada nota lo que hace). La pantalla no suma por su cuenta: la primera
versión lo hacía, y en la prueba del 05-11 la OC de CCU, con su factura
anulada, seguía «Facturado $1.428.000 de $1.428.000» y sin «Facturar».

**En el motor:** `api-rest/src/facturacion/notas/` (las rutas
`/facturacion/documentos`), y `facturas/emision.ts`: el recorrido de mandar
un documento con folio (`enviando`, sin reintentos, el folio repetido una
vez), que ahora comparten la factura y las notas.

**Probado en el laboratorio el 05-11 (madrugada), con CCU #408:** la NC 1
anuló la factura simulada N° 1 ($1.428.000) y lo facturado del mes bajó de
$2.313.000 a $885.000; la OC se volvió a facturar (factura N° 2, «reemplaza
a la Factura 1»); la ND para anular la NC 1 no salió («la OC volvería a
sumar $2.856.000 facturados de $1.428.000»); la NC 2 anuló la factura 2 y
entonces la ND 1 sí salió: la factura 1 volvió a quedar vigente y la NC 1
«Anulada por ND 1». Al final, la NC 3 rebajó $119.000 de la factura 1
(«Rebajada: queda $1.309.000») y la OC volvió a ofrecer «Facturar» por lo
que falta. Cada nota con su PDF en Documentos → Facturas y la nota de BelIA
en la bitácora. El reporte (CSV) sale con BOM y `;`; desde ese día la NC
resta también en el neto y el IVA, para que las columnas sumen en Excel.

**Lo que queda para el paso 0 (L21 sigue abierta):** que facturacion.cl
acepte por el TXT la nota de débito que anula una nota de crédito (en el
simulado ya se arma y se emite), la nota de crédito de una boleta (no se
ofrece todavía) e `IndNoRebaja` (L26, nueva: el manual del TXT no lo
nombra; la rebaja fuera de plazo solo se avisa). Los folios libres de cada
tipo (la maqueta los mostraba) llegan con `ConsultarCAF` en el paso 5: el
simulado no los tiene.

### 9.18 El paso 5: la conexión de verdad (05-11)

Felipe, 05-11: *"avancemos con el paso 5"*. Sin las credenciales no se
puede emitir nada de verdad, así que el paso 5 va en tramos: **5a** (hecho)
deja la conexión lista y dormida; **5b** es el paso 0 en el ambiente de
pruebas, apenas estén las credenciales; **5c** la certificación y el «a
producción».

**5a, hecho el 05-11** (en `api-rest/src/facturacion/facturacion-cl/`):

| Pieza | Qué hace |
|---|---|
| `soap.ts` | `FacturacionClSoap`, el SOAP `wsplano.asmx` sin librerías: `Online`, `ConsultarCAF` (el folio que sigue y los libres), `Procesar` (el TXT en latin-1 y en Base64, `formato` 1) y `ObtenerPdf` (en Base64, para la copia propia). Las credenciales van en Base64, como pide el manual, y nunca van a un error ni al registro. No se pide `IncluyeLink`: el enlace es público (L10). |
| `configuracion.ts` | Qué conexión usa cada motor, con las variables de Railway (§5.3). |
| `sin-conexion.ts` | La que no emite: producción sin credenciales, o credenciales en el motor que no es. Dice por qué, y nunca deja nada «por confirmar». |

**Los candados:**
- El laboratorio emite **solo** con las credenciales de prueba, y producción
  **solo** con las de producción. Producción se reconoce por `NODE_ENV` o
  por su base. Si el laboratorio pareciera producción, queda sin emitir: el
  error va hacia el lado seguro.
- Producción **nunca** usa el simulado: sin credenciales no emite y lo dice
  en un letrero rojo.
- Las credenciales son solo de la empresa de `FACTURACIONCL_EMPRESA`. En el
  laboratorio las demás empresas siguen simuladas; en producción, sin
  conexión.
- `Procesar` nunca se reintenta (L5). Un corte, una demora (60 segundos) o
  una falla del servidor de facturacion.cl dejan «por confirmar». Son un
  rechazo solo la falla `soap:Client` (no leyó el pedido) y un carácter
  fuera de latin-1 (no se mandó). Una respuesta que dice que sí pero no
  trae el folio también queda «por confirmar».
- **Cada documento en su ambiente.** «Comprobar», «Pedir el PDF» y las notas
  usan la conexión del ambiente donde salió el documento. A una factura
  simulada no se le emite una nota de prueba, y la lista ni lo ofrece. Lo
  facturado de una OC cuenta solo lo del ambiente donde se emite: una
  factura simulada no factura una OC de verdad.
- **L11:** en el ambiente de prueba el correo va vacío y la vista previa lo
  avisa. El laboratorio tiene los correos de clientes reales.
- **L23:** lo que no cabe en latin-1 se quita y se avisa (`texto.ts`). El
  conector tiene un último resguardo antes de mandar.

**En la pantalla:**
- El letrero de arriba (`LetreroDelAmbiente`, en Facturación, Boletas y la
  pestaña del evento) dice «Modo simulado», «Modo prueba» o, en rojo, «No
  se puede emitir: …».
- Lo emitido en prueba dice «(de prueba)», y su PDF en Documentos, «(prueba)».
- **«Probar la conexión»** en Facturación (`GET /facturacion/conexion`,
  solo el administrador, no emite nada) muestra:
  - si facturacion.cl responde desde el motor, en cuánto, y su versión;
  - conectado, los folios que quedan de facturas, notas de crédito, notas
    de débito y boletas. Son los folios libres de la maqueta (§9.17).

**Medido en vivo el 05-11 (sin credenciales, solo lo público):**
- `Online` respondió «Online=1» en 0,2 s, y `Version` respondió «1.2.8.3».
- La conexión de Eventia, desde el Mac, contestó «en línea» en 0,4 s, con
  las dos llamadas.
- Una acción que no existe responde HTTP 500 con `soap:Client`. Así queda
  probado el formato de las fallas.
- El esquema es `elementFormDefault="qualified"` con el espacio
  `http://tempuri.org`, sin barra al final.
- El parámetro de `ConsultarCAF` se llama `tipoDTE` en la definición del
  servicio (el manual dice `tipodte`). Manda la definición.
- La forma exacta de lo que responden `ConsultarCAF` y `ObtenerPdf` no está
  en el manual. La lectura es tolerante y se confirma en el 5b.

**Medido en vivo el 06-11 (con las credenciales de prueba, en el
laboratorio):**
- Las credenciales sirven: el motor anotó «conectado en prueba para la
  empresa 1».
- `ConsultarCAF` responde un bloque `<CAF>` por cada rango, con `idcaf`,
  `tipodte`, `fecha` y `fechavencimiento` en DD-MM-AAAA («NO APLICA» en las
  boletas), `rangodesde`, `rangohasta`, `cantidad` y `foliosiguiente`. El
  manual no dice `rangodesde` ni `rangohasta`: la primera lectura buscaba
  `foliodesde` y `foliohasta` y respondía «sin folios».
- Llegan varios rangos por tipo, y algunos agotados: el folio que sigue
  quedó fuera del rango (la nota de débito: 1 a 292.099, con el siguiente
  en 292.100). Vale, entre los rangos con folios, **el cargado primero**
  (el `idcaf` más bajo); los libres suman todos los rangos con folios.
  Medido ese mismo día, con todos los rangos de la misma fecha:
  - a la boleta (folio 0) facturacion.cl le puso el siguiente del rango 59
    (9.300.006.564), no el del 90 (745.814);
  - la factura con el siguiente del rango 67 (292.282) fue rechazada: «El
    folio que esta enviando se encuentra fuera del rango que tiene
    autorizado». Con el del 6 (9.999.839.213) salió;
  - la nota de crédito salió con el del 12 (9.999.974.794);
  - la nota de débito con el del 73 (292.104) fue rechazada igual que la
    factura, y con el del 10 (9.999.742.766) salió.

  En el ambiente de prueba el cargado primero es también el de números más
  altos (los otros rangos los cargó después alguien más); en una empresa de
  verdad es el que se está usando, y el que se carga después sigue cuando
  se acaba. Por si en producción fuera de otra manera, la emisión que
  recibe «fuera del rango» pide una vez más el folio de otro rango (L3).
  «Probar la conexión» anota en el registro del motor todos los rangos de
  cada tipo, tal como los lista facturacion.cl.
- La empresa de prueba es compartida por muchos integradores: los folios
  van en los miles de millones y avanzan solos. Por eso importa reintentar
  una vez si el folio ya existe (L3).

**En el laboratorio desde el 05-11:**
- `pruebas` d6dc2bc7 y 89fb492e (la lista sin acciones fuera de su
  ambiente), con la vitrina 6aec83bc.
- Al arrancar, el motor del laboratorio anotó «facturacion.cl: simulado
  (sin credenciales)». Sigue simulado y no se tomó por producción.

**5b, el paso 0 (necesita las credenciales de prueba).** Lo que hace Felipe:
1. Contratar el Servicio de Integración (D2), con felipe@ como técnico.
2. Esperar el correo de bienvenida con las credenciales de prueba.
3. Cargar el certificado y los folios en facturacion.cl.
4. En Railway, en el motor del **laboratorio**, cargar las cinco variables:
   - `FACTURACIONCL_USUARIO`, `FACTURACIONCL_RUT` y `FACTURACIONCL_CLAVE`,
     las de «Ambiente Prueba»;
   - `FACTURACIONCL_AMBIENTE` = `prueba`;
   - `FACTURACIONCL_EMPRESA` = `1`.

   El motor toma las variables al reiniciar.

Después, en el laboratorio:
- «Probar la conexión»: los folios de cada tipo;
- una boleta y una factura con «Cabaña» y «Quillón» (L9 y L23);
- el folio 0 en una factura (L2);
- la ND que anula una NC y la NC de una boleta (L21);
- el neto y el IVA vacíos en la boleta (L22);
- «SERV» como código (L24);
- `IndNoRebaja` (L26);
- los tiempos;
- el PDF.

Lo emitido se revisa en «Contabilidad/Libro de Ventas» del acceso web de
prueba. Lo que se encuentre se arregla en el laboratorio y se anota acá.

**Resultado del paso 0 (06-11, en el laboratorio, con las credenciales de
prueba de Felipe).** Lo emitido sale con los datos de la empresa de prueba
de facturacion.cl («RAZON SOCIAL PRUEBA», RUT 1-9), no con los de Valle del
Sol: es así en ese ambiente.

| Qué | Resultado |
|---|---|
| La conexión | Conectado en prueba para la empresa 1; `Online` y `Version` (1.2.8.3) en 1 s |
| Los folios (`ConsultarCAF`) | Llegan los cuatro tipos, con varios rangos cada uno: vale el cargado primero (arriba) |
| Boleta | N° 9.300.006.564, $130.000. Con folio 0: el folio lo pone facturacion.cl. 1 s en facturacion.cl y 3,5 s con el PDF |
| Factura | N° 9.999.839.213, $119.000, al receptor Valle del Sol Quillón SpA. El primer intento, con el folio de otro rango, fue rechazado (arriba). 0,9 s en facturacion.cl y 6 s con el PDF |
| NC que anula la factura | N° 9.999.974.794, código 1. 0,7 s en facturacion.cl y 4,9 s con el PDF |
| ND que anula la NC (L21) | N° 9.999.742.766, código 1: **facturacion.cl la acepta**. La factura vuelve a quedar vigente. 1,3 s y 5,7 s |
| «Cabaña» y «Quillón» (L9 y L23) | **Bien en latin-1**: la razón social, la dirección y la descripción salen con su tilde y su ñ. La comuna la imprime facturacion.cl en mayúsculas y sin tilde («QUILLON») |
| Neto e IVA vacíos en la boleta (L22) | Aceptado: el IVA lo calcula facturacion.cl y sale en el PDF ($20.756) |
| «SERV» como código (L24) | Aceptado |
| El PDF (L10) | Llega por `ObtenerPdf` y queda guardado en Eventia en los cuatro documentos |
| La cabaña en la boleta | Iba en «Observación» y facturacion.cl la aceptaba, pero **el PDF de la boleta no la imprime** (el de la factura sí trae el cuadro «Observaciones»). Felipe: *"si ponlo en la descripción"*: ahora va al comienzo de cada línea («Cabaña 4 · Cabaña 4 personas…»), como en «Por boletear» |
| La forma de pago | El PDF de la factura dice «CREDITO» |
| El folio 0 en una factura (L2) | No se probó: con el folio de `ConsultarCAF` no hace falta |
| La NC de una boleta (L21) | No se probó: Eventia todavía no la ofrece |
| `IndNoRebaja` (L26) | No se puede probar todavía: pide una nota más de 6 meses después de su factura |

Lo arreglado en el laboratorio ese día (`pruebas` c22e8097, c4bc8189 y
3845ddf1, y el del cargado primero): la lectura de los rangos con su forma
de verdad, el rango que vale y el reintento con otro rango. Queda para
Felipe: revisar lo emitido en el Libro de Ventas del acceso web de prueba y
pedir la certificación con «Solicitar» (5c).

**El Libro de Ventas, revisado el 07-11** (Felipe entró al acceso web de
prueba, www.facturacion.cl/plano/, con el usuario y la clave del cuadro
«Ambiente Prueba Acceso Web»; Contabilidad → Libro Ventas, noviembre de
2026): están los 8 documentos de las pruebas y cuadran con Eventia. Las
facturas 9999839213 ($119.000) y 9999839219 ($107.100, con el descuento de
$10.000), las boletas 9300006564 y 9300006566 ($130.000 cada una) y
9300006574 ($25.000, al RUT 66.666.666-6), las NC 9999974794 (−$119.000)
y 9999974795 (−$1.000) y la ND 9999742766 ($119.000). En total, neto
$428.656 e IVA $81.444. Solo se ven los nuestros. El recuadro «Estado
certificación empresa», con el botón «Solicitar», no está en ese acceso
de prueba: según el manual (Ficha técnica, paso 5) está en la pantalla de
inicio del sistema de siempre de facturacion.cl.

**El «Solicitar», buscado el 07-11 en la cuenta de Valle del Sol.** No
está: ni en el inicio (tampoco escondido en la página), ni en el acceso de
prueba, ni en Integración → Configuración. El recuadro del manual
(`manualintegracion/img/certificacionintegracion.png`) dice *"Para comenzar
a utilizar el sistema, confirmar que ha finalizado las pruebas necesarias y
solicitar el paso a producción"*: es para la empresa que todavía no emite,
y la ficha agrega que la resolución ante el SII no se cursa hasta terminar
las pruebas. Valle del Sol ya emite sus facturas en producción con
facturacion.cl, y el cuadro «Ambiente Producción» de las credenciales ya
está lleno. El manual dice que, terminadas las pruebas, se pasa a
producción con esas credenciales (DTEPlanoWS: *"se deberán ingresar las
credenciales de 'Ambiente Productivo'"*; servicio web: *"Ya terminadas las
pruebas se proporcionan las que se deben utilizar para el entorno
productivo"*). Falta que soporte confirme que ya están activas. Lo demás
medido ese día:
- **Las boletas no están habilitadas en facturacion.cl.** Las órdenes de
  trabajo lo cuentan: el 09-06 se pidió sacar las boletas (*"emitir
  únicamente facturas"*, OT 349422), el 10-06 se dio de baja el boleteo
  porque iba por otro sistema (OT 349547) y el 27-08 se reclamó un cobro
  por boletas no contratadas (OT 359438). El 06-11 Felipe pidió sumarlas
  (OT 377564, *"Solicito sumar la boleta electrónica"*): sigue
  «Ingresada», sin respuesta.
- La tienda (Inicio → Cotice y compre en línea → Comprar en línea) no
  tiene un módulo de boletas: un tipo de documento nuevo se pide en
  «Documentos adicionales», como *"Certificación de Documento Adicional"*,
  de 3 días hábiles. En «Servicios de integración» está la «Emisión de
  Boletas offline», que es otra cosa (emitir sin conexión).
- El certificado digital está *"en proceso de verificación"*: facturacion.cl
  valida la cédula para cargarlo (aviso del inicio).
- El correo de la compra del Servicio de Integración (06-11, de
  contacto@facturacion.cl a felipe@, «Confirmación de pago y habilitación
  de módulo») solo remite a la misma ficha técnica. Las OT 377562 (la
  compra) y 373116 (la consulta del 24-10) esperan que Felipe las apruebe.

**5c, la certificación y el «a producción»** (el paso a paso, revisado
el 05-11):

*Medido ese día:*
- En producción no hay ninguna tabla de facturación y Valle del Sol no
  tiene el módulo.
- Las migraciones 184 y 187 tienen su número libre en `main` (y la 189, de
  la condición de pago, §9.22); la 187 trae
  también el tarifario.
- La rama va 2 commits detrás de `main`, y al juntarlas solo chocan dos
  mapas del atlas, el 09 y el 18. El código no choca.

*Antes, sin tocar producción:*
1. Felipe pide el paso a producción con «Solicitar», en la pantalla de
   inicio de facturacion.cl (el recuadro «Estado certificación empresa»:
   *"confirmar que ha finalizado las pruebas necesarias y solicitar el paso
   a producción"*). Antes tiene que estar listo el 5b (hecho el 06-11, y el
   Libro de Ventas revisado el 07-11). **07-11: el recuadro no aparece**,
   porque Valle del Sol ya emite (ver arriba); en su lugar se le pregunta a
   soporte si las credenciales de producción ya sirven, y se sigue la OT
   377564 de las boletas.
2. La certificación toma de 3 a 5 días hábiles.
3. Al terminar llegan las credenciales de producción.

*El día del «a producción», en este orden:*
1. **Respaldo:** `modulos_propios` de la empresa 1, en
   `02_RESPALDOS/cambios_de_datos`.
2. **Base de producción:** las migraciones 184, 187 y 189 (la 184b es solo del
   laboratorio). Así quedan las tablas y el módulo de Valle del Sol.
3. **Motor:**
   - se junta `main` en la rama y se resuelven los dos mapas;
   - el PR va a `main`, y al fusionarlo Railway publica solo;
   - se verifica que `/health` muestre el commit nuevo;
   - si se cae al fusionar, «Deploy Latest Commit», no «Redeploy».
4. **Vitrina:** se arma desde `main` y se publica en www.eventi-app.com.
5. **Sin credenciales todavía:** el registro del motor dice «sin conexión:
   facturacion.cl todavía no está conectado» y la pantalla muestra el
   letrero rojo. Nada se emite.
6. **Felipe carga las credenciales de producción** en Railway → api-rest →
   Variables (07-11: ya están emitidas, en facturacion.cl → Administrador →
   Integración → Configuración → Credenciales, cuadro «Ambiente
   Producción»; el cuadro «Ambiente Prueba Acceso Web» trae el enlace y el
   acceso para revisar lo emitido en prueba):
   - las tres de «Ambiente Producción» (RUT, clave y usuario);
   - `FACTURACIONCL_AMBIENTE` = `produccion`;
   - `FACTURACIONCL_EMPRESA` = `1`.

   Después aprieta «Deploy». El registro tiene que decir «conectado en
   produccion para la empresa 1».
7. **«Probar la conexión»** muestra los folios de producción de cada tipo.

**Hecho el 07-11-2026** (Felipe: *"a producción"*), pasos 1 a 5: el
respaldo en `02_RESPALDOS/cambios_de_datos/2026-11-07_facturacion_a_produccion_PROD.json`;
las migraciones 184, 187, 189 y 191 en producción (ahí Supabase le da todo
a `service_role` en cada tabla nueva: se le quitó explícito el DELETE de
`documentos_tributarios` y el UPDATE y el DELETE de
`cobros_por_boletear_cambios`, como en el laboratorio); y la rama
`feature/facturacion-a-produccion`, con los 73 commits de Facturación
encima de `main` (el trozo del radar municipal de 977c490b, solo del
laboratorio, quedó fuera), por el PR #310. **Los pasos 6 y 7, esa misma
noche:** Felipe cargó las cinco variables y apretó «Deploy» (22:43); el
registro dijo «conectado en produccion para la empresa 1». «Probar la
conexión» respondió en 0,9 s: facturas, 51 folios (sigue la N° 381, el
rango vence el 19-02-2027); notas de crédito, 11 (sigue la 115, vence el
27-04-2027); notas de débito y boletas, «NO EXISTE CAF VIGENTE» (sin
folios: la nota de débito solo sirve para anular una nota de crédito, y
las boletas esperan la OT 377564). El diseño del PDF lo pone facturacion.cl
con el formato de la empresa (el logo y el encabezado verde de la factura
N° 379, emitida a mano en su web); Eventia escribe la línea, las
observaciones y la referencia. Felipe vio la maqueta y dijo *"déjalo
así"*.

*Después:*
- Felipe pone los precios del tarifario de boletas (parte vacío).
- La primera boleta y la primera factura reales se emiten mirándolas
  juntos: el folio, el PDF y el Libro de Ventas de facturacion.cl. En
  producción, facturacion.cl le manda el documento al correo del cliente.
- Cuando las boletas de Eventia funcionen, Facto deja de emitir boletas
  (D1).
- **Si algo sale mal:** se le saca el módulo `facturacion` a Valle del Sol
  y Facturación desaparece. Lo ya emitido no se borra: se anula con nota de
  crédito (L6).

### 9.19 Una sola sección «Facturación» (05-11)

Felipe, 05-11: *"Yo hubiese hecho uno solo y que dependiendo del usuario,
qué es lo que puede ver (…) Operaciones y administrador debería poder ver
facturación y boletas. Creo que es demasiado poner dos"*. El módulo ya era
uno (el derecho `facturacion`); lo que eran dos eran las entradas del menú,
«Boletas» y «Facturación». Ahora hay una sola, «Facturación», y adentro
cada cargo ve sus pestañas:

| Cargo | Qué ve |
|---|---|
| Recepción (y el vendedor, como hasta ahora) | «Boleta suelta», «Por boletear» y «Emitidas hoy» |
| Operaciones | Lo de recepción, más «Documentos»: todo lo emitido del mes, el reporte y «Pedir el PDF» (Felipe: *"Ver, reporte y PDF"*) |
| Administrador | Todo, más el «Tarifario», «Comprobar», «Probar la conexión» y anular o rebajar con notas (E5) |

- La pestaña Facturación de cada evento en Post-Venta no cambia (cambió
  esa tarde: §9.20). La dirección vieja `/boletas` lleva a `/facturacion`.
- **En el motor:** la lista (`GET /facturacion/documentos`) y «Pedir el
  PDF» pasaron a operaciones y arriba. Las notas, «Comprobar» y «Probar la
  conexión» siguen solo del administrador, y cada puerta de
  `NotasController` dice su cargo. La lista no le ofrece a operaciones
  anular, rebajar, corregir ni «Comprobar».
- **Lo que cubren las pruebas:**
  - `facturacion/tests/notas.spec.ts`: lo que ve cada cargo y las puertas
    del motor;
  - `pages/facturacion/FacturacionPage.test.tsx`: las pestañas de cada
    cargo y dónde parte cada uno.
- **El vendedor** sigue viendo las boletas, como hasta ahora. Felipe lo
  decidirá con los interruptores de «Permisos por cargo».
- **Desde el 05-11 en la noche (doc 22 §7), cada pestaña es un
  interruptor** de Mi empresa → Usuarios → Permisos por cargo: «Boletas»,
  «Documentos y reporte», «Anular o rebajar» y «Tarifario y conexión». De
  fábrica, la tabla de arriba. Sus puertas del motor llevan `@Permiso` o
  `@DentroDe`; la lista ofrece anular o rebajar con `facturacion_notas` y
  «Comprobar» con `facturacion_ajustes` (`NotasService.lista`), y
  `FacturacionPage` elige las pestañas por permiso. Las acciones finas de
  las boletas (la línea a mano, el cobro nuevo, borrar un cobro) siguen del
  administrador: son de la tanda 2.

Ese mismo día Felipe aprobó la maqueta de **«Permisos por cargo»** (*"si me
parece perfecto"*): una pestaña en Gestión de usuarios con un interruptor
por permiso y por cargo. Lo de fábrica es lo de hoy, lo cumple también el
motor, el administrador nunca se deja afuera y el plan manda arriba. Es un
proyecto aparte, porque toca los permisos de todos los módulos; la
facturación se sumará a él con sus pestañas como permisos.

### 9.20 «Emitir DTE» en el evento (05-11)

> Desde el 07-11 (§9.23) este «Emitir DTE» se abre solo desde Facturación →
> «Por facturar»: la pestaña del evento en Post-Venta salió, y emite quien
> tiene «Facturar eventos» (operaciones y el administrador).

Felipe, 05-11, al revisar la pestaña Facturación del evento: *"el agregar
la orden de compra creo que está mal e innecesario. Si yo en documentos
tengo subido los documentos, se siguen subiendo todos en documentos. Si en
documentos existe un documento cargado como orden de compra, Bel ya debe
leerlo automáticamente y traer la información"*. Y después: *"finalmente
esto es emitir DTE. Y yo puedo elegir si el DTE es una factura, una boleta
y punto. No estos procesos distintos. Luego, el DTE que tiene una
descripción, tiene un precio neto, un precio, una cantidad de personas, un
precio total, el IVA y el total a pagar. Entonces, eso o se completa solo
de la orden de compra o se completa de la información que tiene Eventia, o
bien se edita a mano. Y eso es todo"*. Aprobó el modelo devuelto con *"ok,
vamos programa"*.

**Cómo queda la pestaña Facturación del evento:**

1. **«Emitir DTE».** Al abrir, BelIA lee las órdenes de compra que están en
   Documentos (categoría «Órdenes de compra») y todavía no leyó, y las
   guarda tal como las leyó. Lo que no pudo leer lo dice en ámbar (sin la
   fecha o sin el total no se guarda) y lo vuelve a intentar la próxima
   vez. La OC leída cuyo PDF se quita de Documentos se va con él, salvo que
   ya tenga documentos tributarios.
2. **Factura o Boleta.** Propone la factura si el evento tiene OC o el
   cliente razones sociales; si no, la boleta.
3. **Se llena desde** cada OC, con lo que le queda, o desde la cotización.
   La boleta no va contra una OC (Felipe: *"por la orden de compra van
   contra facturas"*): se llena desde la cotización, con el correo del
   contacto del evento.
4. **Las líneas:** la descripción, la cantidad (las personas), el precio
   con IVA y su total; abajo el neto, el IVA y el total a pagar, como los
   calcula el motor. Todo se edita a mano y se pueden agregar líneas. Si va
   todo el evento y sin niños, BelIA pone las personas por su precio cuando
   cuadra al peso; si no, una línea por el monto con las personas en el
   texto.
5. **«Ver cómo sale»** y «Emitir factura» o «Emitir boleta», solo el
   administrador (D5). Abajo queda lo emitido.

Salen de la pestaña el bloque de las OC («Agregar OC», «Leer con BelIA»,
editar y quitar), «Facturar sin OC (un % o un monto)» y «Por boletear». El
reparto por cabaña de recepción sigue en la sección Facturación.

**Lo que ajustó Felipe al probarlo (05 y 06-11):**
- Las casillas en orden y de un solo alto: la razón social a todo el
  ancho, el RUT con el giro, la dirección con la comuna y la ciudad; las
  referencias en una grilla (tipo en su caja, N°, fecha y quitar) y
  «+ Agregar referencia» como botón azul chico.
- **Sin los checks de «pedir siempre»** (*"saca el check no tiene
  sentido"*; el 06-11, *"ok a ambas"* también para el de la pregunta
  ámbar). Lo que pide cada cliente se cambia solo en su ficha (Datos de
  facturación → «Referencias que pide»); la pregunta ámbar sigue pidiendo
  la referencia que falta. Emitir ya no cambia lo que pide el cliente.
- **La descripción larga, plegada en cada línea:** «+ Descripción larga»
  la abre y «Quitar» la saca del DTE; si BelIA trae el texto largo de la
  OC, ya viene abierta. La buena práctica: el nombre de la línea corto y
  claro (80, lo que se lee en la factura) y la larga (1.000) solo cuando
  el cliente necesita el detalle; para cuadrar, el cliente mira el N° de
  la OC y el monto.

**En el motor:**
- `POST /quotations/:id/facturas/preparar` lee las OC de Documentos
  (`OrdenesDeCompraService.deDocumentos`) y dice de dónde se puede llenar
  y qué tipo se propone.
- El borrador, la revisión y la emisión reciben el `tipo` (33 o 39) y las
  `lineas`, con el precio entero con IVA.
- La factura lleva sus líneas en neto con seis decimales (`precioNetoDe`):
  78 menús de $55.000 suman exacto $4.290.000. L17 queda como aviso: si la
  factura de la OC entera no repite el neto y el IVA de la OC, se dice.
- La boleta sale por el camino de las de recepción
  (`BoletasService.emitirDelEvento`): folio 0, «por confirmar» si se corta,
  la copia del PDF en Documentos y la nota de BelIA en la bitácora.
- Lo ya emitido del evento cuenta también sus boletas.
- E4 sigue igual: sin tope contra el evento (se avisa), nunca más del 100 %
  de una OC, y queda el registro (el % de la OC o del evento se calcula y
  se guarda en el documento).

**Lo que cubren las pruebas:**
- en el motor, `borrador-de-factura.spec.ts`, `facturas.spec.ts`,
  `ordenes-de-compra.spec.ts` y `boletas-sueltas.spec.ts`;
- en la vitrina, `EmitirDte.test.tsx`.

### 9.21 La sección Facturación con «Nuevo documento» (06-11)

Felipe, 06-11, en la noche: *"en el modo facturación, primero lo pondría
abajo de dashboard, segundo eliminaría esto boleta suelta, el por
boletear, emitidas hoy. Creo que el tarifario lo podría dejar. Pero el
resto pondría como abajo el detalle, pondría un botón de crear nuevo DTE
que me pregunte si va a ser nota de crédito, débito, factura, boleta, y
crearla de cero con quizás la misma estructura que tiene el, en
facturación de, de postventa. Y así se pueden armar las boletas y la
factura. Y quizás dejaría un por facturar (…) los eventos que no se hayan
facturado (…) y los pudiera como facturar de acá, hacer una facturación
masiva, etc. Y el otro, un botón arriba que diga, no boleta suelta, sino
que nuevo documento y queda ahí la recepcionista pueda como emitir las
boletas de las cabañas. Hagamos ese cambio y yo me voy a acostar"*.

**Cómo queda la sección:**
1. «Facturación» va en el menú **justo debajo de Dashboard**.
2. Arriba, **«Nuevo documento»** pregunta el tipo, y cada uno ve solo lo
   que puede emitir (sus interruptores de Permisos por cargo, doc 22 §7).
   Con una sola opción (recepción, la boleta) va directo:
   - **Factura** (el administrador con «Documentos», D5): de cero, sin
     evento ni OC. Primero el RUT: si ya es la razón social de un cliente,
     se llena con su ficha y pide las referencias que ese cliente exige; si
     es nuevo, se escribe. Después, el mismo DTE de Post-Venta (las
     líneas, el receptor, las referencias, «Ver cómo sale» y «Emitir
     factura»). No toca ninguna ficha ni bitácora: no es de un evento.
   - **Boleta** (permiso «Boletas»): lo del tarifario por su cantidad, la
     línea a mano solo del administrador, la cabaña y el correo del
     huésped; abajo el neto, el IVA y el total a pagar; «Emitir boleta».
     Es donde la recepcionista emite las boletas de las cabañas.
   - **Nota de crédito o de débito** (permiso «Anular o rebajar»): una
     nota siempre modifica un documento (§9.5), así que primero se elige
     cuál, del mes que se quiera (el motor dice qué admite cada uno), y
     sigue el panel de siempre.
3. Abajo, **el detalle**: «Documentos», «Por facturar» y «Tarifario».
4. **«Por facturar (N)»**: los eventos aceptados o realizados de los
   últimos 90 días y los que vienen a los que les queda algo por emitir
   (lo de antes se facturó fuera de Eventia). Cada uno con su total, lo
   emitido (facturas y boletas, con la cadena: una anulada ya no cuenta) y
   lo que queda. «Facturar» abre ahí mismo el «Emitir DTE» del evento, el
   mismo de Post-Venta. Lo ve quien ve «Documentos»; emite el
   administrador (D5).
   - **La facturación masiva:** el administrador marca varios (o todos) y
     «Facturar los N marcados». BelIA arma el DTE de cada uno como lo haría
     «Emitir DTE» al abrirse (sus OC de Documentos, la factura o la boleta,
     desde la OC que queda por facturar o desde la cotización), sin
     correcciones a mano. Cada evento dice «Lista» o lo que le falta (ese
     se factura uno por uno). «Emitir las N listas» pide una sola
     confirmación con el total y las emite una tras otra; si una queda por
     confirmar o no sale, se detiene ahí, como las boletas de un cobro: lo
     emitido queda emitido.
5. Salen «Boleta suelta», «Por boletear» y «Emitidas hoy». Los cobros por
   boletear quedan en el motor sin pantalla: no se borra nada.

### 9.22 La factura de «Nuevo documento» como la maqueta (06-11)

Felipe, 06-11, con los pantallazos de otro facturador: *"no digo que este
flujo sea la panacea, se puede mejorar, pero para no inventar todo"*. Se
armó una maqueta que se puede usar (artifact «Maqueta de Facturación», con
datos de ejemplo), y la aprobó: *"está perfecto (…) me gusta toda la
usabilidad, todo. Podemos replicar con el mismo formato"*. Va en tres
sprints cortos:

| Sprint | Qué |
|---|---|
| 1 | Crear la factura: la ventana que pregunta qué se emite, y la factura en su propia pantalla |
| 2 | La lista: el resumen que sigue los filtros, el buscador, los filtros por tipo, estado y fechas, y la descarga directa |
| 3 | La boleta y las notas con la misma pantalla y la misma vista previa |

«Recibidos» y la descarga del XML dependen de que facturacion.cl los
entregue: se averiguan antes de prometerlos.

**El sprint 1, la factura nueva:**
- «Nuevo documento» abre una ventana con lo que cada uno puede emitir
  (`NuevoDocumento`); con una sola opción va directo. El documento se arma
  en su propia pantalla, con «← Documentos» para volver.
- **Documento:** la fecha de emisión (la de hoy en Chile) y la condición de
  pago. Felipe: *"por defecto la factura debe ser emitida en crédito a 30
  días... o 45 o 60 (…) no es en cualquier fecha"*. Contado (no queda por
  cobrar) o crédito a 30, 45 o 60 días; el vencimiento es la emisión más el
  plazo. Va en el archivo (`->FormaPago<-`, sin glosa, y
  `->FechaVencimiento<-`) y queda en el documento (migración 189:
  `forma_de_pago` y `vencimiento`). Medido el 06-11: facturacion.cl rechazó
  la glosa «Crédito a 30 días» («solo admiten caracteres alfanuméricos»,
  por las tildes); el plazo ya lo dice el vencimiento. Sin decir nada, crédito a 30 días,
  también en la factura del evento (Post-Venta). No es una regla del SII:
  es la ley de pago a 30 días (Ley 19.983), que pone 30 días corridos desde
  la recepción como máximo; más, hasta 60, solo con las bases de una
  licitación pública o con un acuerdo escrito inscrito en el Ministerio de
  Economía (y no se puede si una pyme le vende a una empresa grande, salvo
  casos puntuales). A 45 o 60 la pantalla lo avisa. facturacion.cl solo
  pide que el vencimiento no sea antes de la emisión.
- **Destinatario:** se busca en Clientes por el nombre o por el RUT, con o
  sin puntos (`GET /facturacion/clientes`: cada cliente con sus razones
  sociales y su contacto principal). Un cliente sin datos de facturación
  también sale y se completan ahí. «Crear cliente nuevo» pide los datos de
  facturación, el tipo de cliente (los de Mi empresa) y el contacto
  (Felipe: *"para que quede en nuestro módulo de clientes"*); se guarda con
  el gancho de Recepción, el cotizador y Clientes (`useCrearCliente`: el
  mismo aviso de «cliente parecido»), y la razón social en su ficha. Un
  RUT que ya está en Clientes no se duplica: se ofrece usar ese cliente. Al
  emitir, lo editado a mano queda en la ficha del cliente (con evento, como
  antes, solo se llena lo que faltaba).
- **Ítems:** los de Post-Venta (`LineasDelDte`), con el descuento en % por
  ítem (Felipe: *"un porcentaje de descuento y el total"*): va sobre el
  neto de la línea, con su % en PorcDescto y su monto en ValorDescto del
  archivo, como lo cuenta el SII, y la suma de los descuentos en
  ValorDesctoTot de los totales (medido el 06-11: en cero, facturacion.cl
  rechaza «no cuadran los montos del detalle y la cabecera»); menos de
  100 % y con dos decimales. Solo
  en la factura (también la del evento); la boleta no lo lleva. Las notas
  copian las líneas con su descuento.
- **Referencias:** las mismas en el evento y acá (`ReferenciasDelDte`): el
  tipo angosto y el folio ancho (Felipe: *"el tipo más chiquito el folio
  más grande"*), la fecha y el motivo, opcional, hasta 90 (RazonRef).
- **Totales:** el neto, el IVA y el total del motor, lo que falta, y
  «Crear documento», que abre la factura tal como saldrá (con la condición
  de pago y los motivos) para emitirla ahí.
- Los largos son los del manual de facturacion.cl: la descripción del ítem
  80, la descripción larga 1.000, el motivo de la referencia 90, y hasta 40
  referencias.

**El sprint 2, la lista (06-11, en la noche):**
- «Documentos» (`ListaDeDocumentos`), como la maqueta: arriba «Emitidos» y
  «Recibidos», y el resumen de lo que se ve, que sigue a los filtros: el
  neto, el IVA y el total (las notas de crédito restan), cuántos documentos
  de cada tipo y cuántos «por confirmar» (enviados sin respuesta: no suman).
- Los filtros: buscar por N°, por cliente (sin importar las tildes) o por
  RUT (con o sin puntos); el tipo (facturas, boletas, notas de crédito o de
  débito); el estado (vigentes, rebajadas, anuladas o por confirmar; la
  corregida vale entera, así que cuenta como vigente; lo dice el motor en
  `situacion`); y el rango de fechas, este mes si no se dice (desde el 08-11, los filtros
  quedan al ir a anular o emitir y volver: viven en la página; Felipe,
  anulando la 377 y la 378 de octubre: *"el sistema me borra los filtros de
  fecha"*). El motor da
  hasta un año por vez (`GET /facturacion/documentos?desde=&hasta=`, las
  dos incluidas) y lo trae por páginas de mil, para que un año de boletas
  no quede cortado. «Limpiar» vuelve a este mes.
- Cada documento: debajo del N° la fecha, la OC (o la primera referencia) y
  el N° del evento; el neto, el IVA y el total; el estado con su color; la
  factura con su condición de pago («Crédito 30 días · vence 06-12» o
  «Contado»); y las acciones: ver el PDF, descargarlo directo y el XML. Sus
  notas van debajo, y lo recién emitido queda marcado.
- «Reporte (CSV)» baja lo que se ve, con el RUT, la referencia, la
  condición de pago y el vencimiento.
- **Averiguado el 06-11 en el manual de facturacion.cl**, antes de
  prometerlos:
  - El XML existe (`getXMLDte`, en el SOAP), pero el manual lo marca como
    método adicional con costo, que se cotiza con su mesa de ayuda. El botón
    queda a la vista y apagado, con el porqué; se conecta si Felipe lo
    contrata.
  - Lo recibido (las facturas de los proveedores) no está en su
    integración: ni el SOAP ni la API REST traen compras, libro de compras
    ni acuse de recibo (`ConsultaLibroVentas` trae solo el libro de ventas
    y el de boletas). «Recibidos» lo dice tal cual; habría que preguntarle
    a su mesa de ayuda. **Corregido el 07-11 (§9.25):** sí existe, en un
    manual aparte, el «WebService de Compras» (el Libro de Compras y el
    Panel DTE Recibidos).

**El sprint 3, la boleta y las notas (06-11, en la noche):**
- Las dos en su propia pantalla, como la factura y la maqueta: arriba
  «← Documentos» y el título, el documento en secciones, «Crear documento»
  que lo muestra tal como saldrá en una ventana, y ahí «Emitir». Las tres
  usan las mismas piezas (`PiezasDelDocumento`: la cabecera y las
  secciones) y la misma vista previa (`VistaPreviaDelDte`), que desde ahora
  sabe dibujar la factura, la boleta y las dos notas.
- Como la maqueta, «Emitir» pregunta antes, en los cuatro documentos:
  «¿Emitir la factura N° … por $…?» (la boleta, sin el N°, que lo pone
  facturacion.cl). Emitido no se borra.
- **La boleta** (`BoletaNueva`): «Qué se cobra» (lo del tarifario por su
  cantidad, con el nombre de su unidad, y la línea a mano solo del
  administrador), «Huésped» (la cabaña, que sale al comienzo de cada
  línea, y el correo) y el total a pagar. Su vista previa la arma el motor
  con las mismas líneas y el mismo armado que al emitirla
  (`POST /boletas/sueltas/revisar`; las líneas, en `boletas/suelta.ts`,
  las comparten las dos). Quien no ve la lista (recepción, de fábrica) se
  queda en la boleta después de emitir, con la última a la vista y otra en
  blanco, para seguir con la próxima.
- **Las notas** (`NotaNueva`): primero qué documento modifica, buscando por
  N°, cliente o RUT entre las facturas y las notas del último año que la
  admiten (la lista con `tipos=33,56,61`: sin bajar las boletas); después
  cómo («Anular completa», «Rebajar un monto» con lo que queda por rebajar,
  o «Corregir un texto» con lo que debe decir), el motivo y el plazo del
  SII. La vista previa trae el emisor y lo que modifica («Corrige el monto
  de la factura electrónica N° … del … · motivo»). «Anular o rebajar…» de
  la lista abre esta pantalla con el documento ya elegido; una rebajada
  parte en «Rebajar», porque ya no se anula entera.
- Salieron la nota en un panel dentro de la lista (`NotaDeUnDocumento`), la
  que se elegía por mes (`ElegirDocumento` y `meses.ts`) y la boleta de
  antes (`BoletaSuelta`).
- **Probado el 06-11 en el ambiente de prueba de facturacion.cl:** la
  boleta N° 9300006574 (una tinaja, con la cabaña al comienzo de la línea)
  y la nota de crédito N° 9999974795, que rebaja $1.000 la factura
  N° 9999839219 (código 3; la factura quedó «Rebajada: queda $106.100»).
  Las dos con su PDF.
- **Medido ese día:** en el ambiente de prueba, la empresa de prueba de
  facturacion.cl es compartida: entre dos boletas de Eventia (6566 y 6574)
  se usaron siete folios que no son nuestros. Por eso el N° que anuncia la
  vista previa de una boleta puede adelantarse, y «Comprobar» una boleta
  que se cortó (L5) no es confiable en prueba: el folio pudo avanzar por
  otro. En producción el rango de folios es solo de la empresa.

**La lista ordenada (07-11):** Felipe, con un pantallazo del laboratorio:
*"hay que ordenar esa matriz"*. Con los folios de prueba de 10 dígitos se
partían el estado, el título de las notas y «Anular o rebajar…», y cada
fila quedaba de un alto distinto. Se dibujó antes de programar (aprobado:
*"exacto"*), y quedó así:
- Cada documento en dos líneas: arriba el N°, el cliente, los montos, el
  estado y los íconos; abajo, en letra chica, la fecha, lo que cambió el
  estado y la acción. Nada se parte; solo el cliente llega a dos líneas.
- En las notas, arriba solo «NC 9999974795»; lo que hace («rebaja la
  9999839219») va junto a la fecha. El motor lo manda aparte (`nombre` y
  `que_hace`); el `titulo` entero sigue en el reporte y en el buscador.
- El estado en una palabra (Felipe: *"que diga rebajada nomás y que abajo
  diga cuánto se rebajó (…) solamente anulada y abajo la nota que la
  anuló"*): «Vigente», «Rebajada», «Anulada» o «Por confirmar»
  (`estadoCorto`, en `cadena.ts`). Abajo, lo que lo cambió: «−$1.000 ·
  vence 06-12» (hasta el 07-11 en la tarde, «Se rebajaron $1.000»), «Por NC
  9999974794»; sin cambios, la condición de
  pago de la factura. Las notas en pie dicen «Vigente» (salió el «Código 3
  · 06-11»), y la factura con un texto corregido vale entera: «Vigente»,
  con «Corregida por NC …» abajo. Los montos no cambian: la nota resta en
  su fila y el resumen ya la descuenta. El filtro «Estado» no cambia.
- La línea de abajo del documento va siempre en una: si no cabe (los folios
  de prueba), termina en «…» y se lee entera al pasar el mouse. La nota
  dice solo la fecha y lo que hace; la OC y el N° del evento ya están en la
  fila de su factura. Si la vitrina llega antes que el motor, la lista se
  ve como antes (los campos nuevos van opcionales).
- **Probado el 07-11 en el laboratorio** (pantalla de 1.210 de ancho, como
  la de Felipe): cada fila en dos líneas (de 53 a 65 px de alto), el
  cliente en dos como máximo, y «Rebajada» con «Se rebajaron $1.000 ·
  vence 06-12», «Anulada» con «Por ND 9999742766» y la NC con «06-11-2026
  · rebaja la 9999839219». `pruebas` e41a341e, bf648b6e y dcbc3544; motor
  e41a341, vitrina 6aef35ed.
- Después, Felipe: *"creo que el botón de anular o rebajar debería estar
  en acciones"*. Dibujado y aprobado (*"si hazlo así"*): es un botón más de
  la fila de íconos, en rojo y al final («Anular o rebajar…» al pasar el
  mouse; «Anular…» en las notas). Donde no se puede (la boleta, lo ya
  anulado), su lugar queda vacío y los otros íconos no se mueven; quien no
  tiene el permiso no ve el lugar. «Pedir el PDF» y «Comprobar» siguen
  debajo, como texto.
- Y con un pantallazo (Felipe: *"¿hay alguna otra forma de dejar
  vinculados los documentos sin que se arme esta cascada infinita?"*;
  dibujado y aprobado, *"si hazlo así"*):
  - **Una sola sangría:** debajo de cada factura van todas sus notas (y
    las notas de sus notas) a la misma distancia, de la más vieja a la más
    nueva; lo que modifica cada una lo dice su línea de abajo («anula la
    NC 9999974794»). Así lo dibujaba la maqueta.
  - **Lo anulado, achurado en gris suave** de lado a lado (líneas finas;
    Felipe: *"plomita, un achurado más suave"*): la factura anulada sí, la
    nota que la anula no. Una nota va achurada solo si otra la anuló (la
    NC que anuló una ND).
  - **«−$1.000»** bajo «Rebajada», en vez de «Se rebajaron $1.000», y un
    poco menos de aire entre los montos: desde el cuarto botón la tabla no
    cabía y «Acciones» quedaba pegado al borde.
  - **La lista a todo el ancho de la pantalla** (Felipe: *"si ocupas el
    ancho completo de la pantalla podrías tener más espacio"*); el
    documento que se arma sigue con su ancho de formulario.

### 9.23 Todo se factura en Facturación (07-11)

Felipe, 07-11: *"No estoy seguro si me convence que en postventa hay una
parte de facturación (…) creo que se debería facturar todo desde el módulo
de facturación, así las funciones quedan bien repartidas. Y lo que podemos
separar es que el recepcionista solamente puede emitir boletas y facturas
de cabañas según el tarifario, y los de operación y administrador pueden
facturar los eventos que falten facturar"*. Se le propuso el reparto de
abajo, con el vendedor apagado, y respondió *"ok hazlo"*.

**Un solo lugar para facturar.** El mismo «Emitir DTE» estaba en dos
partes: la pestaña Facturación del evento y «Por facturar». La pestaña de
Post-Venta salió (`FacturacionTab` y `DocumentosEmitidos` borrados); el
evento se factura solo en Facturación → «Por facturar». Post-Venta se queda
con lo que es del evento: la OC se sube en Documentos (BelIA la lee al
facturar) y el PDF de cada documento sigue llegando a Documentos →
Facturas. Las puertas de las OC del evento (`/quotations/:id/ordenes-de-
compra`) quedan sin pantalla.

**Quién emite qué** (de fábrica; cada fila es un interruptor de Permisos
por cargo, doc 22 §3.1):

| Cargo | Qué emite | Dónde |
|---|---|---|
| Recepción | Boletas y facturas, solo con los precios del tarifario | Facturación → «Nuevo documento» |
| Vendedor | Nada (se le prende si hace falta) | — |
| Operaciones | Lo de recepción, más los eventos que faltan por facturar | Facturación → «Por facturar» |
| Administrador | Todo: líneas a mano, descuento, notas de crédito y débito, y el tarifario | Facturación |

- **Los interruptores:** «Boletas» pasó a llamarse «Boletas y facturas del
  tarifario» (la misma clave `boletas`; el vendedor, apagado de fábrica), y
  se sumó «Facturar eventos» (`facturacion_eventos`: operaciones y el
  administrador), con «Por facturar», la facturación masiva y la emisión
  del evento. **Cambia la D5:** los eventos ya no los emite solo el
  administrador. La E5 sigue: anular o rebajar, solo el administrador.
- **La factura del tarifario** (`facturas/del-tarifario.ts`, puro, lo usan
  la vista previa y la emisión): cada línea elegida del tarifario lleva su
  nombre y su precio con IVA de ahí, y la persona pone la cantidad y, si
  quiere, la descripción larga. La línea a mano y el descuento son del
  administrador, como en la boleta (D3). En la pantalla, recepción solo
  ve «Elegir del tarifario» con el precio fijo; el administrador escribe a
  mano y también tiene «+ Del tarifario».
- **El destinatario de recepción:** lo busca en Clientes o lo crea, como
  el administrador. Como no escribe en la ficha de los clientes, su razón
  social no se guarda al crearlo: la guarda la emisión.
- **Quien no ve la lista** (recepción) se queda en la factura después de
  emitir, con la última a la vista y su PDF, como en la boleta.
- **La entrada del menú** la ve quien tenga cualquiera de los cinco
  permisos de Facturación: apagar uno no deja afuera de los otros.
- **Lo que cubren las pruebas:** en el motor, `tests/del-tarifario.spec.ts`
  y `facturas.spec.ts` (recepción emite con el tarifario y no a mano);
  `permisos-de-fabrica.spec.ts` revisa que cada puerta diga lo mismo que el
  catálogo. En la vitrina, `FacturaNueva.test.tsx` (recepción y el
  administrador) y `FacturacionPage.test.tsx` (las pestañas por permiso).

### 9.24 Lo ya facturado fuera de Eventia y la factura a las empresas (07-11)

Felipe, 07-11 en la tarde, antes del «a producción»: *"la idea es empezar a
emitir (…) las boletas no, porque tenemos que esperar que nos activen las
boletas, pero mientras podemos hacer las facturas"*. Y sobre la lista:
*"lo que hay que facturar son los eventos que están aceptados y de eso yo
te puedo dar el check de lo que ya está facturado (…) primero montémoslo y
luego te voy diciendo cuáles ya están facturados"*. Las dos piezas de
abajo se le propusieron y dijo que sí.

**Medido ese día en producción** (solo lectura): «Por facturar» mostraría
48 eventos, $265 millones, porque Eventia no sabe lo que se facturó a mano
en la web de facturacion.cl ni lo que se boleteó en Facto: 20 ya
realizados y 28 que vienen. 11 ya tienen el PDF de la factura en
Documentos. Con la masiva, alguno se podría facturar dos veces.

**«Ya está facturado»** (migración 191, `eventos_facturados_fuera`):
- En «Por facturar», cada evento tiene «Ya está facturado», que pregunta
  antes, en el lugar del botón («¿Sacarlo? Sí · No» desde el 08-11, §9.31;
  `ConfirmInline` azul: se puede deshacer) y saca el evento de la
  lista y de la masiva. No emite ni anula nada: es la marca de lo que se
  hizo fuera.
- Lo marcado queda abajo, plegado, en «Facturados fuera de Eventia (N)»,
  con quién lo marcó y cuándo, y «Devolver», que lo trae de vuelta.
- Lo puede marcar quien tiene «Facturar eventos» (operaciones y el
  administrador, de fábrica): Felipe lo marca en la pantalla, o lo dice y
  se marca por él.
- **«Tiene factura en Documentos»**, en ámbar bajo el cliente (en el mismo
  lugar que sus OC): el evento tiene en Documentos el PDF de una factura
  subido a mano. Las copias que deja Eventia al emitir no cuentan: eso ya
  lo dice lo emitido. Es un aviso para revisarlo primero, no una marca.
- En el motor, «Por facturar» y lo nuevo salieron de `FacturasService` a
  `PorFacturarService` (`facturas/por-facturar.service.ts`): el servicio
  había pasado las 800 líneas.

**La boleta, solo a un particular.** BelIA proponía la boleta a todo evento
sin OC ni razón social, también a una empresa (Soprole #414, por ejemplo).
Con las boletas en pausa, la masiva habría intentado boletas que
facturacion.cl rechaza. Ahora propone la factura si hay OC o razones
sociales, o si el cliente no es particular; la boleta, solo a un cliente
cuyo tipo es particular (`client_types.es_particular`, doc 21). Un cliente
sin tipo no es particular. A una empresa sin datos de facturación le falta
su RUT: la masiva lo dice y se factura uno por uno, con «Crear cliente
nuevo» o los datos del receptor.

**Las boletas, en pausa.** No se construyó nada: facturacion.cl todavía no
tiene habilitada la boleta para Valle del Sol (la OT 377564 la pide, §9.18).
Recepción sigue con Facto; si alguien intenta una boleta en Eventia,
facturacion.cl la rechaza sin emitir, y «Probar la conexión» muestra las
boletas sin folios.

**Lo que cubren las pruebas:** `tests/por-facturar.spec.ts` (lo marcado va
aparte, el aviso del PDF y marcar o devolver solo un evento aceptado o
realizado de la empresa) y `facturas.spec.ts` (la boleta solo a un
particular). En la vitrina, `PorFacturar.test.tsx`.

### 9.25 Lo que sigue: lo recibido y el RUT que llena todo (07-11, en la noche)

Felipe, 07-11 en la noche, ya conectado en producción: *"¿ya trajiste las
facturas recibidas? ¿eso funcionará?"*; después, *"¿cómo lo podemos hacer
para que al momento de facturar, el sistema cargue todo solo con el RUT?
¿se podrá?"*, y *"deja el plan hecho"*. Este es el plan. **No se
construye sin su OK.** Aprobado esa misma noche (*"me parece perfecto el
orden, sumemos todo"*), junto con lo de las OC de §9.26.

**Lo recibido sí existe (corrige §9.22).** El manual de facturacion.cl
tiene un «Manual WebService de Compras» aparte
(`manualintegracion/archivomanualwscompras.php`), con dos servicios SOAP:
- **Libro de Compras** (`https://api.facturacion.com/WSFacturacion/Compra?wsdl`),
  método `ObtenerCompra`: los documentos del libro de compras de un mes
  (`periodo` AAAA-MM, obligatorio), con su XML y, con `Incluyelink` = 1,
  el enlace al PDF cedible. Filtra por RUT del emisor, tipo, folio, forma
  de pago y fecha de ingreso; `ConXML` = 1 trae solo los que llegaron con
  su XML de intercambio. Entra con el RUT y la clave de la empresa.
- **Panel DTE Recibidos** (`https://wss.facturacion.cl/WSDS/wspaneldte.asmx?wsdl`),
  con usuario, RUT y clave: `ConsultaPanelDte` (los pendientes de acuse:
  folio, tipo, RUT del proveedor, fecha de recepción en el SII, monto y si
  trae XML), `ObtenerPanelDte` (el XML de uno) y `Acuse` (aceptar o
  rechazar).
- El manual no dice que cuesten aparte (`ConsultaLibroVentas` y
  `getXMLDte` sí lo dicen). Se sabe probando.

**El plan de «Recibidos»**, en tres pasos:
1. **La prueba, solo lectura.** El motor le pide a `ObtenerCompra` el mes
   en curso con las credenciales de producción y muestra cuántos
   documentos trae, como «Probar la conexión». No guarda nada. Si responde
   que el servicio no está contratado, se le pregunta a facturacion.cl, y
   el costo lo decide Felipe.
2. **La lista del mes.** La pestaña «Recibidos» con el proveedor, su RUT,
   el tipo, el folio, la fecha, el neto, el IVA, el total y el PDF, con el
   mismo resumen y los mismos filtros de «Emitidos». Una copia en la base
   (`documentos_recibidos`, migración nueva) para no pedirle todo a
   facturacion.cl cada vez.
3. **Después, con otro OK:** «Aceptar» y «Rechazar» desde el panel
   (`Acuse`), dentro de los 8 días que da la ley para reclamar una factura.

**El RUT que llena todo.** Al escribir el RUT del cliente, Eventia llena la
razón social, el giro, la dirección, la comuna y la ciudad. Busca en este
orden:
1. **Lo guardado en Eventia.** Ya existe (§9.21, `GET
   /facturacion/razon-social?rut=`): la razón social guardada en cualquier
   cliente. Medido el 07-11 en producción: 0 guardadas, porque todavía no
   se factura nada desde Eventia; se llena sola con cada factura.
2. **Las facturas que ya emitió en facturacion.cl** (la última a mano fue
   la N° 379). El motor baja una vez sus PDF con `ObtenerPdf`, que viene
   incluido en el servicio, y lee el cuadro del cliente: Señor(es), RUT,
   giro, dirección, comuna y ciudad. Es texto del PDF, sin IA. Lo que calza
   por RUT con un cliente de Eventia queda como su razón social. Primero
   se prueba con una que `ObtenerPdf` también entregue lo emitido en la
   web.
3. **La nómina pública del SII** de las personas jurídicas
   (`sii.cl/sobre_el_sii/nominapersonasjuridicas.html`, actualizada en
   agosto de 2026): `PUB_NOMBRES_PJ` (la razón social), `PUB_NOM_ACTECOS`
   (las actividades, de donde sale el giro) y `PUB_NOM_DIRECCIONES` (las
   direcciones de la casa matriz y las sucursales). Una tabla con el RUT,
   la razón social, la actividad principal y la dirección de la casa
   matriz, para la empresa que nunca ha comprado. Antes de cargarla se
   mira el disco de producción (el 29-10 se llenó).
- Lo que llena el historial o el SII se ve antes de emitir y se puede
  corregir; lo corregido queda guardado en el cliente.

**Lo que no se puede:** preguntarle al SII en línea (su consulta de
terceros pide captcha), y la nómina no trae a las personas naturales: a
esas se les escriben los datos la primera vez, y desde ahí quedan
guardados.

### 9.26 Las OC que se leen solas y la factura por partes (07-11, en la noche)

**En producción desde el 08-11-2026** (PR #312). Medido esa mañana: al
abrir «Por facturar», BelIA leyó sola las 8 OC de Documentos en 6
segundos, y cada evento quedó con «Con OC», su número, su monto y su
estado. En la #460 (Municipalidad de Quillón) la OC dice $2.480.000 y la
cotización $1.640.000: lo revisa Felipe antes de facturar.

Felipe, 07-11 en la noche, con el plan de §9.25 aprobado (*"me parece
perfecto el orden, sumemos todo, lo dejo trabajando y lo reviso mañana
temprano"*):
- *"Con las órdenes de compra, cada vez que una se suba se debería leer y
  dejar todo listo para facturar."*
- *"Imagina la cotización de CCU, 20M, y el proveedor emite 2 OC, una por
  10 y otra por 10 (…) el sistema debe reconocer cuando esté por
  facturar, cuando esté facturado parcialmente y cuando esté todo
  facturado. Mismo caso: cliente emite OC por todo el monto pero pide
  facturar un % primero y otro % después (50 % y 50 % es un caso
  habitual, también puede ser 30 % y 70 %)."*
- *"De forma inicial deberíamos leer todas las OC y precompletar las
  facturas antes de colocar facturar… quizás un distintivo que diga con
  OC."*

**La OC se lee al subirla.** `POST /event-documents` con la categoría
`ordenes_compra` deja el documento y, si la empresa tiene Facturación,
BelIA lo lee por detrás (`OrdenesDeCompraService.leerAlSubir`, el mismo
`deDocumentos` de «Emitir DTE»). Quien sube no espera; lo que BelIA no
puede leer queda en el registro y se intenta de nuevo al facturar.
`QuotationsModule` importa `FacturacionModule` para eso (sin ciclo).

**La primera lectura.** Las OC que se subieron antes, o las que BelIA no
pudo leer, se leen solas al entrar a «Por facturar», una vez por visita
(`POST /facturacion/por-facturar/leer-ordenes`, tres eventos a la vez):
«BelIA está leyendo N órdenes de compra…», y bajo el cliente, en ámbar, la
que no pudo con su motivo. Lo que no pudo leer (un PDF que no es una OC,
una OC repetida) no se le vuelve a mandar a la IA en 12 horas: la primera
lectura repite el motivo; «Emitir DTE» y la subida sí lo intentan de nuevo.
Medido el 07-11 en producción: 9 PDF de OC en 7 eventos, ninguno leído. En
el laboratorio, esa noche, avisó los dos casos: el «Informe de evaluación
Crece 2026» subido como OC y una OC subida dos veces.

**Pendiente, parcial o facturado.** El evento y cada OC tienen su estado
(`estadoDeLaFacturacion`): pendiente si no se ha facturado nada, parcial si
algo, facturado si todo; $1 de redondeo se tolera. Lo facturado de cada OC
se cuenta con la cadena (`facturadoDeLasOC`): una factura anulada ya no
cuenta. En «Por facturar»:
- la columna «Estado»: «Pendiente», o «Parcial» con el % facturado debajo
  (una palabra y el detalle abajo, como pide Felipe);
- bajo el cliente, «Con OC» y una línea por OC: «OC 4500001 · $10.000.000
  · facturada», «… 30 % facturado» o «… pendiente»;
- bajo lo que queda, la OC que factura «Facturar»: la primera con saldo;
- los facturados completos en Eventia, abajo y plegados, en «Facturados en
  Eventia (N)».

**Cómo se porta con los casos de Felipe:**
- *Dos OC de $10M para una cotización de $20M:* el evento sale
  «Pendiente» con las dos OC pendientes. «Facturar» propone la primera OC
  por sus $10M, con su referencia 801. Emitida, el evento queda «Parcial,
  50 % facturado», la primera OC «facturada», y «Facturar» propone la
  segunda. Con la segunda, el evento pasa a «Facturados en Eventia». La
  masiva factura una OC por evento cada vez.
- *Una OC por todo, al 50 % y 50 % (o 30 % y 70 %):* en «Emitir DTE», bajo
  «Se llena desde», **«Qué parte»**: «Todo lo que queda», «50 %», «30 %» u
  «Otro %», de la OC elegida o de la cotización, con la base a la vista.
  BelIA arma esa parte (`parteDe`: el % de la base, al peso, nunca más de
  lo que queda), la OC y el evento quedan «Parcial, 50 % facturado», y la
  segunda vez «Todo lo que queda» es el otro 50 %. La factura parcial lo
  dice en una segunda línea de observaciones: «Factura parcial: 50 % de la
  OC N° 4500123» (o «de la cotización N° 523» sin OC). La primera línea
  sigue igual (Felipe aprobó el diseño esa noche: *"déjalo así"*).
- El candado de siempre: nunca más del 100 % de una OC (§5.3).
- *Una OC para dos eventos* (la Municipalidad de Quillón: la OC
  1213301-49-AG26, de $2.480.000, paga el foro de la #415 y el de la
  #460, $1.240.000 cada uno): **no se programa.** Felipe, 08-11: *"es un
  caso tan particular que es mejor no programarlo"*; y sobre facturar por
  partes: *"si es solo cambiar el monto lo cambio yo, listo, lo más
  simple siempre es lo mejor"*. Se factura cambiando el monto a mano en
  «Emitir DTE». Ojo: BelIA deja la OC entera en el evento donde la lee
  (en la #460 «Facturar» propone $2.480.000), y la misma OC en otro
  evento lleva su propia cuenta.

**Lo que cubren las pruebas:** `por-facturar.spec.ts` (los dos casos de
Felipe y la primera lectura), `borrador-de-factura.spec.ts` (el 50 %, el
30 % y el 70 %, el tope en lo que queda y la observación),
`event-documents-vendedor.spec.ts` (la OC subida se lee, otra categoría o
una empresa sin Facturación no). En la vitrina, `PorFacturar.test.tsx` y
`EmitirDte.test.tsx` («Qué parte»).

### 9.27 El RUT que llena todo: la nómina del SII (08-11, en la madrugada)

**En producción desde el 08-11-2026** (PR #312; migración 192 en las dos
bases).

El paso 3 del plan de §9.25 (*"me parece perfecto el orden, sumemos
todo"*). Los pasos 1 y 2 de ese orden:
- **Lo guardado en Eventia** ya existía (`GET /facturacion/razon-social`),
  pero ninguna pantalla lo usaba.
- **Las facturas ya emitidas en facturacion.cl** quedaron para después
  (solo se pueden probar en producción): hechas el 08-11, en §9.29.

**La nómina.** Migración 192: `sii_contribuyentes`, `sii_actividades` y
`sii_cargas`, sin `company_id` (datos públicos, de nadie). «Cargar la
nómina del SII» (`POST /facturacion/nomina-sii/cargar`, del administrador
con «Tarifario y conexión») corre por detrás:
1. baja de sii.cl los tres ZIP (unos 190 MB);
2. reparte los 3,37 millones de nombres por tramo de 100.000 RUT;
3. recorre los 3,8 millones de actividades y los 4,46 millones de
   domicilios, que vienen ordenados por RUT, de a tramo y con freno;
4. guarda una fila por empresa con actividades vigentes, de a mil, y al
   final borra las de otras cargas.

Medido el 08-11 con los archivos reales (sin la base): 1.709.121 empresas,
674 actividades, 28 segundos y unos 200 MB de memoria (con 256 MB de tope,
termina). Con readline se perdían líneas y la memoria llegaba a 764 MB: se
cambió por `lineasDelFlujo`. Queda fuera del respaldo diario. Una carga a la
vez; si falla, queda la anterior.

**Qué se toma de cada empresa** (`nomina-sii.ts`):
- **La razón social**, cortada a 100.
- **El giro.** El SII no marca la actividad principal: Valle del Sol tiene
  cuatro (hoteles, residenciales para turistas, restaurantes y compraventa
  de inmuebles), y CCU S.A., dos de oficina. Se propone la primera afecta
  a IVA (la de lo que vende); entre ellas, la más antigua. Va cortado a 40
  sin dejar un paréntesis abierto. Las demás se ofrecen con un clic.
- **La dirección.** El domicilio vigente más reciente: calle, número,
  bloque y oficina, cortado a 60. La comuna y la ciudad (o la comuna si no
  trae ciudad), a 20.

**En la factura** (`CamposDelReceptor`, en «Nuevo documento», «Crear
cliente nuevo» y «Editar receptor y referencias» del evento):
- con un RUT válido, busca lo guardado en Eventia y, si no, la nómina;
- llena **solo lo vacío**: lo escrito a mano no se pisa;
- dice de dónde salió: «Llenado con la nómina del SII» o «Llenado con la
  ficha de …»;
- del SII, sus otras actividades para cambiar el giro (desde el 08-11, en
  una lista: «El RUT arriba», al final de esta sección).

La búsqueda pasó a `@Permiso('boletas', 'facturacion_eventos')`, para que
sirva también al facturar un evento.

**«Nómina del SII»**, junto a «Probar la conexión» (el administrador):
cuántas empresas tiene y cuándo se cargó, «cargando… N empresas» mientras
carga, el motivo si falló, y «Cargar la nómina del SII» o «Cargar de
nuevo». El SII la pone al día una vez al año (los archivos de agosto).

**Lo que no hace:** las personas naturales no están en la nómina (se
escriben la primera vez), y no le pregunta al SII en línea (pide captcha).

**Lo que cubren las pruebas:** `nomina-sii.spec.ts` (el giro de Valle del
Sol, la dirección, la carga con ZIP de prueba, la falla del SII, la nómina
con pocas empresas, una carga a la vez y el dígito verificador),
`facturas.spec.ts` (lo de Eventia primero; si no, el SII) y, en la vitrina,
`CamposDelReceptor.test.tsx` y `NominaDelSii.test.tsx`.

**A producción:** primero el motor (que la deja fuera del respaldo),
después la 192 (mirando el disco: unos 300 MB) y la carga, de noche.
**Cargada en producción el 08-11 a las 05:05** (con la sesión de Felipe):
1.709.121 empresas y 674 actividades en 3 minutos y 28 segundos; la tabla
pesa 359 MB y la base quedó en 1,9 GB de 8. Probado en «Nuevo documento»
→ «Crear cliente nuevo» con el RUT 96.930.440-6, sin guardar ni emitir:
llenó la razón social, el giro, la dirección y la comuna, con «Otras
actividades en el SII».

**El RUT arriba (08-11; en producción desde el 08-11-2026, PR #314).** Felipe, después de probarlo
en producción: *"el rut debería aparecer arriba de los primeros para
ingresar, así el resto se rellena solo y se achura (¿es la mejor práctica
para evitar errores o lo dejamos editables?)"*; *"cuando hay más de 1 giro
detectado debería generarse una lista desplegable con una flechita para
elegir el giro"*; y que el correo quede en el cliente al emitir. Se le
recomendó achurar con una salida, vio la maqueta y dijo *"hazlo así"*.
- **El orden:** el RUT primero; después la razón social, el giro, la
  dirección con la comuna y la ciudad, y los correos.
- **Lo que trae el RUT, achurado** (en gris, con candado y sin contador),
  para no tocarlo por error. «Corregir datos» lo abre todo: el SII puede
  estar atrasado, o el cliente pide la dirección de una sucursal (la
  nómina trae la casa matriz). Lo que ya estaba o se escribe a mano queda
  abierto, y también lo que no cabe en la factura y, en el laboratorio,
  la razón social cortada de un PDF (§9.29).
- **El giro, de una lista** cuando el SII trae más de una actividad («N
  actividades en el SII»; la lista de la casa, con buscador). Reemplaza
  los botones de «Otras actividades en el SII». Otro giro se escribe con
  «Corregir datos».
- **Otro RUT** reemplaza lo que trajo el anterior y, si no lo encuentra,
  lo vacía. Lo escrito a mano se queda.
- **Los correos, siempre abiertos.** Ya se guardaban (`recordarReceptor`
  del motor): al emitir, la razón social con su correo queda en la ficha
  del cliente y el RUT la trae la próxima vez. Sin correo, la casilla lo
  dice: «Queda guardado en el cliente al emitir: la próxima vez se llena
  solo.»
- **Lo que cubren las pruebas:** `CamposDelReceptor.test.tsx` (el orden,
  lo achurado y «Corregir datos», la lista del giro, otro RUT y el aviso
  del correo).

### 9.28 «Recibidos»: el Libro de Compras (08-11, en la madrugada)

**En producción desde el 08-11-2026** (PR #312; migración 193 en las dos
bases).

Los pasos 1 y 2 del plan de «Recibidos» de §9.25, juntos: «Traer de
facturacion.cl» es la prueba (si el servicio no está contratado, lo dice
y no guarda nada) y, si responde, la lista del mes. El paso 3 (aceptar o
rechazar con `Acuse`) sigue esperando otro OK.

**El servicio** (`facturacion-cl/compras.ts`), visto en su definición
pública el 08-11 (`Compra?wsdl` y `?xsd=1`): SOAP en Java (JAX-WS) en
`https://api.facturacion.com:443/WSFacturacion/Compra`, método
`obtenerCompra` (espacio `http://api.facturacion.com/`, sin SOAPAction):
- pide `login` con `Rut` y `Clave` (en Base64, las mismas de la conexión),
  `periodo` AAAA-MM e `IncluyeLink` = 1;
- responde `WSPLANO` (`Resultado`, `Mensaje`, `Detalle`), con un
  `Documento` por cada recibido: su `XML`, el `RCV` (`recepcionSII`,
  `acuseSII`, `tipoCompra`) y el `LinkPDF`.

El XML se lee escapado, en Base64 (en ISO-8859-1, como lo emite el SII) o
en CDATA, sin confundir sus etiquetas con las del sobre. De cada uno se
toma quién lo emite (RUT y razón social), el tipo, el folio, la fecha, el
neto, lo exento, el IVA y el total.

**La copia** (migración 193, `documentos_recibidos`): una fila por emisor,
tipo y folio, con su mes, el enlace del PDF y lo del SII. Lo que vino sin
XML se cuenta y no se guarda.

**En la pantalla** («Documentos» → «Recibidos», `RecibidosDelMes`):
- el mes con sus flechas y «Traer de facturacion.cl» (con cuándo se trajo);
- cada documento con el proveedor y su RUT, el tipo y el folio, la fecha
  y cuándo lo recibió el SII, el neto, el IVA, el total y «PDF»;
- arriba, cuántos son y el total (las notas de crédito restan, en rojo);
- sin la conexión, el botón apagado y el porqué.

Lo ve y lo trae quien ve «Documentos» (`facturacion_documentos`:
operaciones y el administrador, de fábrica). Aceptar o reclamar lo recibido, en
§9.30.

**Lo que falta saber:** si su cuenta lo tiene habilitado o cuesta aparte.
Probado en el laboratorio el 08-11 (la empresa de prueba de
facturacion.cl, RUT 1-9): el servicio leyó el pedido y respondió
`Resultado` falso con «Empresa no Autorizada» (la pantalla lo muestra tal
cual y no guarda nada). O sea, el pedido está bien hecho y lo recibido se
habilita por empresa. La respuesta de Valle del Sol se ve en producción con
«Traer de facturacion.cl». Si también dice «Empresa no Autorizada», se le
pide a soporte de facturacion.cl que lo habilite; el costo lo decide
Felipe.

**Medido en producción el 08-11 (Valle del Sol), y cuesta aparte:**
«Traer de facturacion.cl» respondió *"No tiene activo el módulo
WSPANELDTE, este es un servicio adicional que debe ser contratado."* La
pantalla lo muestra tal cual y no guarda nada. Contratar el módulo lo
decide Felipe; sin él no hay lista de lo recibido. El acuse de §9.30 va
justo por ese servicio (`wspaneldte.asmx`).

**Lo que cubren las pruebas:** `recibidos.spec.ts` (el sobre sin las
credenciales a la vista, el XML en Base64, escapado y en CDATA, la
negativa, la falla del servidor, guardar lo traído y sin conexión) y, en
la vitrina, `RecibidosDelMes.test.tsx`.

### 9.29 Tus facturas anteriores: la segunda fuente del RUT (08-11, en la madrugada)

Felipe, 08-11, con la nómina del SII camino a producción: *"a producción y
luego con lo que falta... ¿qué pasó con buscar los datos solo con el
RUT?"*. Es el paso 2 del orden de §9.25, aprobado el 07-11.

**Por qué hace falta, medido el 08-11:**
- La agrupación de profesores jubilados de la factura N° 379 (la última
  que Felipe emitió a mano) **no está en la nómina del SII**. Las
  agrupaciones, juntas y clubes que no iniciaron actividades no salen ahí,
  y son clientes de siempre de Valle del Sol.
- Con las empresas, el SII da el giro que propone Eventia; la factura
  anterior trae el que se usó de verdad. A CCU, por ejemplo, el SII le
  propone «Alquiler de bienes inmuebles amoblados».

**Lo que hace:** «Leer mis facturas anteriores», junto a la nómina del SII
(lo ve el administrador, con «Tarifario y conexión»). Por detrás:
1. Pide a facturacion.cl cada factura (33) con `ObtenerPdf`, que viene
   incluido; el XML con `getXMLDte` cuesta aparte. Va desde la anterior a
   la siguiente que dice `ConsultarCAF`, hacia atrás, a lo más 1.000, una a
   la vez.
2. De cada PDF lee el cuadro del cliente (`texto-del-pdf.ts`, sin IA ni
   librerías). Los PDF de facturacion.cl los arma JasperReports con iText:
   cada texto viene con su posición. Se buscan «Señor(es)», «R.U.T.»,
   «Giro», «Dirección», «Comuna» y «Ciudad», y el valor que sigue a su «:»
   en la misma fila. Lo que no se puede leer (otro formato, un RUT que no
   calza) no se guarda.
3. Cada RUT queda con lo de su factura más nueva. La migración 194 trae
   `receptores_de_facturas_anteriores` y `lecturas_de_facturas_anteriores`
   (cuántas se pidieron, cuántas trajeron PDF y cuántos clientes salieron).
4. Si facturacion.cl deja de responder cinco veces seguidas, la lectura se
   corta y queda el motivo.

En el ambiente de prueba la empresa es compartida con otros integradores:
ahí solo se leen las facturas que emitió Eventia.

**El orden al escribir el RUT** (`GET /facturacion/razon-social`):
1. Lo guardado en Eventia, la razón social de un cliente.
2. Su última factura en facturacion.cl, con el aviso «Llenado con tu
   factura N° 379 del 01-11-2026: revisa que siga igual.».
3. La nómina del SII.

El PDF corta la razón social a 50 caracteres (medido en la N° 379). Si
llega con 50 y el SII la tiene entera, va la del SII. Si no, la pantalla
dice «La razón social viene cortada en el PDF: complétala.». Las
actividades del SII se ofrecen igual como giro.

**Lo que cambió del plan de §9.25:** decía que lo que calza por RUT con un
cliente de Eventia quedaba como su razón social. No se puede: desde la 184,
los clientes no tienen RUT (va en sus razones sociales, que en producción
eran 0 el 07-11). Lo leído queda por empresa y por RUT; al facturar a ese
cliente, la razón social se guarda en su ficha, como siempre.

**Probado** el 08-11, sin la base, con la factura N° 379 de producción (el
PDF que Felipe bajó el 07-11) y con la 9999839219 de prueba: los dos
formatos se leen enteros, con las tildes.

**Lo que cubren las pruebas:**
- `facturas-anteriores.spec.ts`: los dos formatos armados como los de
  facturacion.cl, uno de pdf-lib con el texto en hexadecimal, el RUT que no
  calza, de la más nueva a la más vieja, en prueba solo las de Eventia, sin
  conexión, una lectura a la vez y el corte.
- `facturas.spec.ts`: el orden y la razón social cortada.
- En la vitrina, `FacturasAnteriores.test.tsx` y
  `CamposDelReceptor.test.tsx`.

**A producción**, con su «a producción»: primero la 194 en la base, después
el motor y la vitrina, y al final «Leer mis facturas anteriores». Son unas
380 facturas, de 3 a 6 segundos cada una: media hora, por detrás.

### 9.30 Aceptar o reclamar lo recibido (08-11, en la madrugada)

El paso 3 del plan de «Recibidos» de §9.25 («después, con otro OK»).
Felipe, 08-11: *"a producción y luego con lo que falta"*. Lo construido se
prueba en el laboratorio; **usarlo con una factura de verdad es decisión
de Felipe**, porque tiene efecto legal.

**Por dónde va:** el «Panel DTE Recibidos» de facturacion.cl
(`https://wss.facturacion.cl/WSDS/wspaneldte.asmx`, medido el 08-11 en su
definición pública), un servicio ASMX aparte del de emitir, con la misma
entrada (`logininfo`: usuario, RUT y clave en Base64):
- `ConsultaPanelDte(login, folio, tipo, rutproveedor)` trae lo pendiente
  de acuse (sin filtros, todo): el folio, el tipo, el RUT del proveedor y
  la recepción en el SII.
- `Acuse(login, folio, tipo, rutproveedor, accion)`, con `a` para aceptar
  y `r` para rechazar (reclamar), responde verdadero o falso.
Lo demás del servicio (`ObtenerPanelDTE`, `ObtenerPdfDTE`, las guías) no
se usa.

**En «Recibidos»**, una columna «Acuse» con el estado en una palabra y el
detalle debajo:
- **Pendiente** (está en el panel), con el plazo: «quedan 3 días para
  reclamar», «hoy es el último día» o «ya no se puede reclamar (la ley la
  da por aceptada)». La ley 19.983 da 8 días corridos desde la recepción.
- Para el administrador (con «Documentos», `@DentroDe`), «Aceptar» y
  «Reclamar», cada uno con su confirmación: «¿Aceptarla ante el SII?
  Después no se puede reclamar.» y «¿Reclamarla ante el SII? El proveedor
  tendrá que anularla con una nota de crédito.». Vencido el plazo, solo
  «Aceptar».
- **Aceptada** o **Reclamada** desde Eventia, con quién y cuándo.
- Lo demás, lo que dice el libro del SII (`acuse_sii`), o «—».
- Si el panel responde que no («Empresa no Autorizada», por ejemplo),
  arriba: «Panel de recibidos: facturacion.cl dice «…»».

**Los resguardos del motor** (`RecibidosService.acuse`): solo un
documento que está en lo recibido de la empresa; una sola vez por
documento (si ya salió desde Eventia, 409 con quién lo hizo); reclamar
solo dentro de los 8 días; y cada intento, salga o no, queda anotado en
`acuses_de_recibidos` (migración 195: qué documento, qué se pidió, qué
respondió facturacion.cl, quién y cuándo; sin cambiar ni borrar).

**Medido el 08-11 en el laboratorio:** el panel SÍ responde para la
empresa de prueba (el Libro de Compras, no: «Empresa no Autorizada»,
§9.28), y no con el `WSPLANO` que muestra el manual, sino con una lista en
JSON: «[{"folio":"…","tipodte":"33","rutproveedor":"…","recepcionsii":
"2026-03-10T00:00:00Z","montototal":"…","xml":"True"}]». Se leen las dos
formas. Lo pendiente de la empresa de prueba es de otros integradores: no
se guarda ni se acusa (en el laboratorio no hay nada recibido que mostrar
en la lista).

**Lo que falta saber:** si la cuenta de Valle del Sol tiene el panel y el
Libro de Compras habilitados; se mira en producción con «Recibidos».
**Medido el 08-11 en producción (§9.28):** no los tiene. facturacion.cl
pide contratar aparte el módulo WSPANELDTE, el de este panel. Antes de
llevar §9.30 a producción, Felipe decide si lo contrata.

**Lo que cubren las pruebas:** `recibidos.spec.ts` (el ejemplo del manual,
la respuesta escapada, el sobre sin las credenciales a la vista, el acuse
con «a» o «r», la falla, el plazo de 8 días, aceptar con su anotación, la
negativa anotada, lo que no es de la empresa, dos veces, sin conexión y el
reclamo vencido) y, en la vitrina, `RecibidosDelMes.test.tsx`.

**A producción**, con su «a producción»: primero la 195 en la base, después
el motor y la vitrina.

### 9.31 «Por facturar»: el buscador y la revisión una por una (08-11)

**En el laboratorio y en producción desde el 08-11-2026** (PR #314). Felipe, mirando «Por facturar»
en el laboratorio, pidió cuatro cosas:
- *"buscador arriba, por rut, nombre cliente, persona contacto, nro de
  cotización etc. amplio"*;
- *"el botón ya no debería ser + nuevo documento, si no que facturar
  seleccionados, ahí debería desplegarse un modal con la misma estructura
  de documento (dejémoslo como pieza de estructura de factura/boleta) que
  ocupamos en nuevo documento, así puedo revisar una por una (como cuando
  reviso los pagos, con la flecha arriba con un botón de corregir y un
  botón de aprobar) y luego al final pinchar el facturar todas"*;
- *"abajo solo dejaría el botón ya está facturado, el facturar lo dejaría
  solo con el de arriba y si se va a facturar 1 solo, se selecciona y
  luego el botón facturar seleccionados"*;
- *"me parece extensa la cantidad de información por línea, el nro de OC
  está dos veces, quizás el resto de la información debería ser un
  recuadro que aparezca solo en el modal"*.

Se le dijo lo entendido con una maqueta y respondió *"sí, así"*.

**La lista:**
- **El buscador**, arriba: el N° de la cotización, el cliente, el
  contacto, el tipo de evento, el N° de cada OC y los RUT (de las razones
  sociales del cliente y de sus OC), con puntos, sin puntos o solo los
  números. Usa el criterio de todos los buscadores (`matchesSearch`: sin
  tildes, por palabras, en cualquier orden), y filtra también los dos
  plegados de abajo. Para esto, «Por facturar» trae de cada evento el
  contacto (el de la cotización, o el de la ficha) y los RUT del cliente
  (`eventosDesde`), y de cada OC su RUT (`ordenesDeLosEventos`).
- **«Facturar seleccionados (N)»**, junto al buscador. En esta pestaña
  reemplaza a «+ Nuevo documento», que sigue en «Documentos» y
  «Tarifario». Sin nada marcado, está apagado.
- **Cada fila, solo con sus columnas:** el evento con su tipo, el cliente
  con el distintivo «Con OC», la fecha, el estado, el total, lo emitido y
  lo que queda; y solo «Ya está facturado». Salieron «Facturar», las
  líneas de cada OC, la OC repetida bajo lo que queda, «N OC sin leer»,
  lo que BelIA no pudo leer y «Tiene factura en Documentos»: todo eso va
  en «Lo del evento», dentro de la revisión. Para facturar uno solo, se
  marca y se usa el botón de arriba. Los plegados de abajo también quedan
  sin las líneas de las OC.
- **Una factura por cada OC** (Felipe, 08-11, con la #481 de Santo Tomás:
  un evento, tres OC y tres facturas, *"una factura por cada OC"*). Un
  evento con varias OC con saldo entra a la revisión como un documento por
  OC, cada uno a nombre del comprador de su OC («1 de 3 · OC 33000132942»):
  se revisan, aprueban y emiten aparte, en la misma vuelta. BelIA lee el
  evento una sola vez (`revisarUnoParaLaMasiva` con la OC y una preparación
  compartida), «Lo del evento» marca la OC de esta factura y su barra
  cuenta lo de las anteriores del mismo evento. Lo cubren
  `RevisionDeLaFacturacion.test.tsx` y `revisarUnoParaLaMasiva.test.ts`.
  Probado en el laboratorio con la #423 y una segunda OC de prueba. **En
  producción desde el 08-11-2026** (PR #321, solo la vitrina).
- **Las columnas no se mueven** (Felipe, 08-11: *"se mueven todas las
  columnas cuando intento colocar algunas como facturadas"*). La pregunta
  «¿Ya se facturó fuera de Eventia? Sí, sacarlo · No» era más ancha que el
  botón y la tabla repartía las columnas según lo que traía cada fila.
  Ahora cada columna tiene su ancho (`table-fixed`); el cliente toma lo que
  sobra, con «Con OC» siempre a la vista y el nombre cortado con «…» si no
  cabe; y la pregunta cabe en el lugar del botón: «¿Sacarlo? Sí · No».
  Medido en el laboratorio a 1.440 px: las columnas quedan iguales al
  preguntar, al cancelar y al buscar. **En producción desde el
  08-11-2026** (PR #317, solo la vitrina).

**La revisión** (`RevisionDeLaFacturacion`), una ventana que **reemplaza a
la facturación masiva** de §9.21 (`FacturacionMasiva` se borró):
- BelIA arma el documento de cada evento marcado como «Emitir DTE» al
  abrirse (`revisarUnoParaLaMasiva`: factura o boleta, desde la OC con
  saldo o desde la cotización).
- **Uno por uno**, con las flechas arriba («#423 · cliente», y debajo «2
  de 5 · 1 aprobada»), como los días de las fichas en Personas.
- Arriba, **«Lo del evento»**: sus OC con su estado, las que BelIA no ha
  leído y por qué no pudo (lo de la primera lectura), «Tiene factura en
  Documentos», los avisos del motor y lo que falta. Gris si solo informa;
  ámbar si hay algo que mirar.
- Abajo, **el documento** con las secciones de «Nuevo documento»
  (`DocumentoDelDte`, la pieza de la factura y la boleta para leer, con
  `Seccion`): Documento (tipo, emisión, condición de pago y las
  observaciones), Destinatario, Ítems (precio con IVA y total, como en
  «Nuevo documento»), Referencias y Totales (los del motor). No muestra el
  N° que sigue: cada una toma el suyo al emitir.
- **«Corregir»** abría el «Emitir DTE» del evento; desde la tarde del
  08-11 abre el mismo documento con casillas (§9.32). Corregir uno ya
  aprobado lo deja sin aprobar hasta que se apruebe de nuevo.
- **«Aprobar»** lo deja listo tal como se ve y pasa al siguiente que
  falta. Lo que no está listo no se aprueba: el botón queda apagado y
  «Lo del evento» dice qué le falta.
- **«Facturar las N aprobadas»** pregunta antes («¿Emitir N documentos por
  $X en total? Emitidos no se borran.») y las emite una tras otra; si una
  se corta o no sale, se detiene ahí, y lo emitido queda emitido. Al
  final, la ventana dice qué salió de cada una («Factura N° … emitida»,
  «Por confirmar» o el error). Las que no se aprobaron no se emiten.
- Con algo aprobado, o emitiendo, la tecla Escape no cierra la ventana.

**Lo que cubren las pruebas:** en la vitrina, `PorFacturar.test.tsx` (la
fila solo con sus columnas, «Facturar seleccionados» con los marcados, lo
que BelIA no pudo leer llega a la revisión, y el buscador por contacto,
RUT con y sin puntos, N° y OC), `RevisionDeLaFacturacion.test.tsx` (las
flechas, aprobar y saltar, solo se emiten las aprobadas, lo que falta no
se aprueba, «Corregir» y si una no sale) y `EmitirDte.test.tsx`
(«Aprobar» devuelve lo corregido sin emitir). En el motor no cambia
ninguna regla: solo vienen más datos para buscar.

**En producción desde el 08-11-2026** (PR #314): solo el motor y la vitrina, sin migración.

### 9.32 «Corregir» con la pieza de «Nuevo DTE», y la fecha de emisión (08-11)

**En el laboratorio y en producción desde el 08-11-2026** (PR #314). Felipe, viendo «Corregir» en la
revisión (el «Emitir DTE» del evento): *"no me gustan todos estos chip...
se pueden mejorar, mira la cantidad de información, podemos replantear
esto"*. Se le mostró una maqueta (el mismo documento por secciones, con
casillas; los avisos una sola vez) y respondió *"me parece mejor, si
arreglas esta pieza también se arregla desde el botón + nuevo documento
(debería llamarse + nuevo DTE)"*. Y sumó: *"revisa cómo funcionan las
fechas de emisión, creo que se puede elegir qué fecha ponerle dentro de
ciertos límites (…) revisa cómo funciona a nivel SII, cómo funciona a
nivel facturacion.cl, e inclúyelo en este sprint"*.

**La pieza común.** La factura de «Nuevo DTE» (`FacturaNueva`) y
«Corregir» de la revisión (`CorregirDte`) usan las mismas secciones y las
mismas piezas:
- **Documento** (`SeccionDocumento`): el tipo (fijo en «Nuevo DTE»; en el
  evento, una lista: factura o boleta), de dónde se llena (solo el evento:
  sus OC con saldo o la cotización, en una lista), la fecha de emisión y
  la condición de pago (una lista: crédito a 30, 45 o 60 días, o
  contado). Debajo, solo el vencimiento, y el aviso de la Ley 19.983 si
  pasa de 30 días. Cambiar el tipo o la fuente le pide a BelIA el
  documento de nuevo, y se conservan la fecha y la condición elegidas.
- **Destinatario**: en el evento, la razón social del cliente en una lista
  si tiene varias (o «Otra razón social»), y los datos con el RUT arriba
  (`CamposDelReceptor`, §9.27). Lo que el SII pide y falta va **en rojo en
  su casilla** («Giro · falta»), en vez de un aviso aparte. La boleta,
  solo el correo.
- **Ítems** (`LineasDelDte`), **Referencias** (`ReferenciasDelDte`) y
  **Totales** (`TotalesDelDte`), las de siempre.
- Salieron los chips de «Factura / Boleta», «Se llena desde», «Qué
  parte» (50 %, 30 %, otro %: para facturar una parte se cambia el monto,
  Felipe, 08-11: *"si es solo cambiar el monto lo cambio yo"*), y los
  avisos repetidos («BelIA no pudo leer…» iba dos veces; lo que faltaba,
  tres). Los avisos van una sola vez, en «Lo del evento».
- En la ventana, corrigiendo, abajo: «Cancelar», «Listo» (vuelve al
  documento con lo corregido, sin aprobarlo) y «Aprobar» (apagado hasta
  que el motor diga que está listo). «Corregir» parte de lo que se está
  revisando (lo de BelIA o lo ya corregido): `revisarUnoParaLaMasiva`
  guarda la preparación y el borrador de BelIA para no pedírselos de
  nuevo.
- Se borraron `EmitirDte`, `EditarReceptor` y `CondicionDePago` (y sus
  pruebas): nadie más los usaba. El motor no cambia: las mismas rutas
  `preparar`, `borrador`, `revisar` y `emitir` del evento.
- El botón de arriba se llama **«+ Nuevo DTE»** (antes «+ Nuevo
  documento»), y su ventana, «Nuevo DTE».

**La fecha de emisión, medida ese día:**
- **El SII.** La fecha de emisión del DTE (`FchEmis`) es la «fecha de
  emisión contable del documento»; el formato solo pide una fecha válida
  entre 2003-04-01 y 2050-12-31 (Formato DTE v2.2). Su propio facturador
  la propone en el día y deja cambiarla (*"toma por defecto la fecha
  actual y puede ser modificada por el usuario"*, guía del Portal
  MIPYME). Aparte quedan la fecha y hora de la firma (`TmstFirma`, que
  pone facturacion.cl al firmar) y la de recepción en el SII, desde la
  que corren los 8 días para reclamar. La vigencia de los folios (6 meses
  desde su autorización) se mira contra la firma, no contra la emisión
  (rechazo CAF-3-517).
- **La ley del IVA** (DL 825, art. 55): la factura va en el momento de la
  venta; en los servicios, en el mismo período tributario (el mes) en que
  se paga o se pone a disposición; con guías de despacho, hasta el décimo
  día del mes siguiente, con fecha del mes de las entregas.
- **El Registro de Ventas** la pone en el mes de su fecha de emisión: una
  factura con fecha del mes anterior cae en el IVA de ese mes, que se
  declara en el F29 hasta el día 20 (los facturadores electrónicos que
  declaran y pagan por internet; el plazo general es el 12).
- **facturacion.cl** la recibe en `FechaEmision` (AAAA-MM-DD) y su manual
  no le pone otro límite. Eventia ya la mandaba, siempre con la de hoy.

**Lo que deja Eventia** (`facturas/fecha-de-emision.ts`, el más simple
que respeta todo eso): la de hoy si no se elige; **hasta el último día del
mes en curso**; **hasta el día 20, desde el 1 del mes anterior**; desde el
21, solo el mes en curso. Al partir no dejaba fechas futuras; Felipe
preguntó *"¿emitir con una fecha posterior, ejemplo hoy con fecha 30 de
noviembre, se puede?"*: el SII no lo prohíbe (un informe de Círculo Verde
de 2019 dice que su plataforma las acepta y que la factura vale desde ese
día; ninguna norma fija cuántos días), y dentro del mes no cambia el IVA
en que cae. Dijo *"sí, hazlo, pruébalo"*. El pedido lleva `fecha_emision` (solo la factura;
la boleta va con la del día), la revisión devuelve el rango (`emision`:
desde y hasta) para la casilla, y una fecha fuera del rango no deja
emitir («La fecha de emisión va del 01-10-2026 al 30-11-2026»). El
vencimiento, los plazos de las notas y lo facturado del mes salen de la
fecha elegida, porque es la que queda en el documento. Si Felipe declara
el F29 antes del 20, se puede bajar a 12 (`DIA_DEL_F29`).

**Probado el 08-11 en el ambiente de prueba de facturacion.cl:** la
factura N° 9999839228 de $1.000, emitida ese día con fecha 30-11-2026,
salió con esa fecha (en el archivo y en su PDF, que llegó solo; vence el
30-12). Dejó a la vista un error: Eventia anotaba como fecha del documento
la «Fecha» con que responde facturacion.cl, que es **cuándo lo procesó**
(el 08-11). Desde entonces se anota **la del archivo**: al emitir
facturas, notas y boletas, y al «Comprobar» lo que quedó por confirmar
(antes, el día en que se comprobaba). La de esa factura de prueba se
corrigió a mano en la base del laboratorio.

**Lo que cubren las pruebas:** en el motor, `fecha-de-emision.spec.ts`
(el rango, enero, la elegida, la futura y la anterior al rango),
`facturas.spec.ts` (fuera del rango no se manda nada), `emision.spec.ts`
(la fecha anotada es la del documento) y `notas.spec.ts` («Comprobar»
deja la fecha del archivo); en la vitrina,
`SeccionDocumento.test.tsx`, `CorregirDte.test.tsx` (las secciones sin
chips, lo que falta en rojo, lo corregido sube listo, otra fuente le pide
a BelIA), `FacturaNueva.test.tsx` (las listas y la fecha) y
`RevisionDeLaFacturacion.test.tsx` («Listo» y «Aprobar» de lo corregido).

**En producción desde el 08-11-2026** (PR #314): el motor y la vitrina, sin migración.

### 9.33 Dos pasos para emitir, el PDF solo y el XML a pedido (08-11)

**En el laboratorio y en producción desde el 08-11-2026** (PR #314). Felipe, después de emitir en
producción la factura N° 381 de $100 y la nota de crédito N° 115 que la
anula: *"3 aprobaciones para emitir un documento me parece raro"*; *"¿no
se puede descargar inmediatamente el PDF? el botón pedir PDF para cada
factura creo que no me pinche"*; y *"¿el XML no lo trae esto
facturación.cl?"*. Se le propuso lo de abajo y dijo *"ok"* a las dos
primeras, y del XML: *"debería ser solo en los pocos casos donde los pide
el cliente, con un botón (puede ser el mismo de ver XML, que si lo pincho
lo pide a facturacion.cl)"*.

**Dos pasos para emitir.** «Crear documento» muestra el documento tal
como saldrá (`VistaPreviaDelDte`), y su «Emitir» emite: ya no pregunta
«¿Emitir la factura N° … por $…?», porque la vista previa es la revisión.
Vale para los cuatro documentos de «Nuevo DTE». En la revisión de «Por
facturar», el botón dice cuántas y por cuánto («Facturar las 2 aprobadas ·
$1.190.000») y emite sin volver a preguntar: cada una ya se aprobó.

**El PDF, solo.** Medido en producción el 08-11 (registro del motor): la
factura N° 381 salió a las 10:19 sin su PDF, porque facturacion.cl todavía
no lo tenía; Felipe lo trajo con «Pedir el PDF» a las 10:21. La nota N° 115
también salió sin PDF. Felipe: *"debe ser un tema de cuánto se demora
facturación.cl en emitir y generar, entonces si es en el mismo acto no
está"*, y *"prueba con 5 a 10 segundos"*.
- Al emitir (factura, boleta y notas), si el PDF no llega, el motor lo
  vuelve a pedir solo, por detrás, a los 5 y a los 10 segundos, y después
  a los 20 y 40 segundos, al minuto y medio, a los 3 minutos y medio y a
  los 8 minutos y medio (`REINTENTOS_DEL_PDF_MS`,
  `guardarCopiaDelPdfAlEmitir` en `facturas/copia-del-pdf.ts`). Quien emite
  no espera. Si alguien ya lo trajo, no se pide de nuevo; si nunca llega,
  queda en el registro.
- La lista «Documentos» se pone al día sola cada 5 segundos mientras un PDF
  viene en camino (hasta 30 veces), así los íconos se encienden sin hacer
  nada.
- Salió el botón «Pedir el PDF». Si todavía no está, «Ver» y «Descargar»
  lo traen de facturacion.cl en el mismo clic (`POST
  /facturacion/documentos/:id/pdf`, que ahora devuelve dónde quedó); «Ver»
  abre el visor apenas llega (`abrirAlMontar` de `FileViewLink`).

**El XML, a pedido.** facturacion.cl lo entrega con `getXMLDte`, un método
que su manual marca con «Costo Adicional»; al emitir solo devuelve el
folio, el resultado y los enlaces al PDF. El ícono del XML de la lista
dejó de estar apagado: al pincharlo, el motor se lo pide a facturacion.cl
(`POST /facturacion/documentos/:id/xml`, `obtenerXml` del SOAP) y se baja
tal cual, en ISO-8859-1. No se guarda: se pide cada vez. Medido el 08-11
en el ambiente de prueba: facturacion.cl entregó el XML de la factura
9999839219, pero como Base64 solo, no dentro de «Mensaje» como dice su
manual; se leen las dos formas (`leerXml`). Si facturacion.cl
no lo entrega (por ejemplo, porque el método no está contratado), la
pantalla dice lo que respondió. El costo se suma a la OT de WSPANELDTE
(«4. El valor del método getXMLDte»), y lo decide Felipe.

**Lo que cubren las pruebas:** en el motor, `copia-del-pdf.spec.ts` (llega
al emitir, llega en un reintento, ya lo trajo alguien, nunca llega),
`soap.spec.ts` (el XML en Base64 y lo que responde si no) y `notas.spec.ts`
(la acción `xml` y su puerta); en la vitrina, `ListaDeDocumentos.test.tsx`
(sin «Pedir el PDF», el PDF en un clic y el XML con su botón),
`BoletaNueva`, `NotaNueva` y `RevisionDeLaFacturacion` (sin la pregunta).

**En producción desde el 08-11-2026** (PR #314): el motor y la vitrina, sin migración.

**Medido en producción ese mismo día:** «Ver» de la NC N° 115 trajo su PDF
de facturacion.cl en un clic (quedó guardado a las 12:23), pero el visor
no se abrió: la fila se refrescaba con el PDF antes de saber que había
que abrirlo, y `FileViewLink` solo miraba `abrirAlMontar` al montarse.
**Arreglado en el laboratorio** (08-11): el visor se abre también cuando
el pedido llega después, y `alCerrar` lo olvida al cerrarlo, para que no
se abra de nuevo si la fila vuelve a aparecer (`ListaDeDocumentos.test.tsx`:
«"Ver" trae el PDF que falta y abre el visor en el mismo clic», que falla
sin el arreglo). Probado en el laboratorio con la factura 9999839228 sin
su PDF: un clic lo trajo y lo abrió. **En producción desde el 08-11-2026**
(PR #315, la vitrina), con el OK de Felipe («sí a ambos»), junto con lo
del XML que sigue.

**El XML, medido en producción el 08-11** (con el OK de Felipe, en la
factura N° 381 y sin descargar nada): facturacion.cl respondió con una
falla, «Esta opcion es un servicio adicional solo para clientes que lo
contraten». No viene en el plan. **Lo que decidió Felipe:** él consulta
el precio; si lo cobran, el XML queda a pedido con su botón, como está, y
si no lo cobran, se trae solo al emitir, igual que el PDF. La pantalla
mostraba dos avisos equivocados: «El sistema no puede leer la base de
datos…», porque el motor respondía con un 503 y la vitrina avisa todo 503
como la base (`api.ts`), y «facturacion.cl no responde: Server was unable
to process request…». **Arreglado** (08-11; en producción desde el
08-11-2026, PR #315, el motor): la falla
de `getXMLDte` es su respuesta (`obtenerXml`) y la pantalla dice «El XML
es un servicio adicional de facturacion.cl y no está contratado.». Todo lo
demás de facturacion.cl, y la conexión sin credenciales, responde con un
502 y con lo que dijo, sin el envoltorio de .NET (`queDijo`): «facturacion.cl
respondió: …» o «facturacion.cl no responde: …». Lo cubren `soap.spec.ts`
y `xml-a-pedido.spec.ts`, que fallan sin el arreglo.

### 9.34 La barra de lo facturado en «Lo del evento» (08-11)

Felipe, 08-11, revisando la #460 de la Municipalidad de Quillón: *"acá
sería interesante tener el monto en valores del evento, quizás una
barrita de lo que ya está facturado (ejemplo Rudel debo meter una OC de
adelanto de 4M) y el resto queda pendiente"*. Vio la maqueta y dijo *"si
dale armalo"*.

- Arriba de «Lo del evento» (`LoDelEvento.tsx`, `BarraDeLoFacturado`):
  «Evento $10.000.000», una barra y debajo «Facturado $X · Esta factura
  $Y · Queda $Z». Verde lo ya facturado, azul lo de este documento y
  gris lo que queda. En la boleta dice «Esta boleta».
- Lo facturado es el `emitido` de «Por facturar» (la cuenta del motor,
  con las notas de crédito restando, §9.26); lo de este documento, el
  total de su revisión (`vista.montos.total`), también mientras se
  corrige. Solo pantalla: el motor ya mandaba las dos cifras.
- Si con este documento se pasa del total del evento (más de $1, el
  redondeo de siempre), lo dice en ámbar, «Con esta factura se pasa del
  evento por $840.000», y el recuadro queda ámbar. Pasó en la #460: la OC
  por $2.480.000 contra una cotización de $1.640.000. No frena: si hay
  OC, manda la OC (E4).
- El adelanto de Rudel: la factura de la OC de $4M deja el evento en
  «Parcial, 40 %», y lo que queda sigue en «Por facturar».
- Lo cubre `LoDelEvento.test.tsx`.
- **En producción desde el 08-11-2026** (PR #319, solo la vitrina), con el
  «ok» de Felipe.
- **El recuadro azul** (Felipe, 08-11: *"ese cuadro ámbar, podría ser un
  cuadro azul más bonito? lo encuentro todo fome en cuanto a diseño"*; con
  la maqueta: *"me parece bien el recuadro"*). Siempre azul: el total del
  evento grande arriba, la barra más gruesa, Facturado / Esta factura /
  Queda en columnas que no se mueven (sin el documento, «—»), y lo que hay
  que mirar en su propia franja ámbar (roja si no cuadra); las OC y los
  avisos abajo, en chico. **En producción desde el 08-11-2026** (PR
  #321, solo la vitrina).
- **El documento nuevo a todo el ancho** (Felipe, 08-11, con «Nueva
  factura electrónica»: *"acá deberíamos aprovechar el ancho también"*): la
  pantalla de la factura, la boleta y la nota ya no se queda en el
  `max-w-5xl`, igual que la lista. **En producción desde el 08-11-2026** (PR
  #321).

### 9.35 El nombre del PDF y sin la descripción larga (08-11)

**El nombre.** Felipe, 08-11: *"cuando descargo la factura el nombre puede
ser FXXXXX_ CLIENTE _ NRO COTIZACIÓN_OC SI TIENE"*. Queda
«F383_Municipalidad de Quillón_460_1213301-49-AG26.pdf»
(`facturas/nombre-del-pdf.ts`):
- La letra del documento con su folio: F (factura), B (boleta), NC (nota
  de crédito) y ND (nota de débito).
- El cliente como está en Eventia, más corto que la razón social; si el
  documento no es de un evento, la razón social, y en la boleta suelta, la
  cabaña.
- El N° de la cotización y la OC si tiene. Lo que falta no se pone.
- Sirve para «Descargar» y para el título del visor (el motor lo manda en la
  lista, `nombre_del_pdf`), y para la copia que queda en Documentos →
  Facturas del evento. En el balde va sin tildes ni espacios
  («F383_Municipalidad_de_Quillon_460_1213301-49-AG26.pdf»). Lo ya emitido
  cambia solo al descargarlo; su copia en Documentos conserva el nombre de
  antes.

**Sin la descripción larga.** Felipe, 08-11, con la factura N° 383: *"la
descripción corta y larga se pisan, quizás deba evitar usar la descripción
larga si no puedes tú darle espacio"*. La larga la dibuja facturacion.cl
encima de la raya del ítem y le cambia las comas por puntos; el diseño es de
ellos (el servicio incluye el «diseño inicial de impreso») y el archivo no
admite saltos de línea, así que desde Eventia no se le puede dar espacio.
Desde el 08-11:
- Eventia ya no la llena sola (`glosaYDescripcion`): todo va en la glosa de
  80, y lo que no cabe se corta en una palabra, sin «...».
- El detalle del evento sin OC deja primero la cotización (va igual en las
  observaciones) y después las personas, para caber en los 80.
- Si la descripción de la OC pasa de 80, la revisión avisa «La descripción
  de la OC pasa de 80 caracteres y va cortada: revísala.».
- «+ Descripción larga» queda para escribirla a mano. El arreglo de fondo es
  de facturacion.cl: Felipe lo suma a su consulta.

**Lo que cubren las pruebas:** `nombre-del-pdf.spec.ts`, `borrador-de-factura.spec.ts`
(la glosa cortada sin larga, el evento con niños y el aviso de la OC),
`facturas.spec.ts` (la copia en Documentos con el nombre nuevo) y, en la
vitrina, `ListaDeDocumentos.test.tsx` (el nombre al descargar).
**En producción desde el 08-11-2026** (PR #320, el motor y la vitrina, sin
migración), con el «ok» de Felipe y su *"vamos con todo lo demás"*.

### 9.36 Traer una factura emitida fuera de Eventia (08-11)

Felipe, 08-11, con la #481 de Santo Tomás: las N° 374 y 375 se hicieron
el 30-10 en la página de facturacion.cl, cada una por el 50 % de su OC, y
hay que anularlas para facturar una por OC. *"¿podrás traer estas facturas
para hacer las notas de crédito desde acá o las debo hacer desde
facturación?"*; con las dos opciones a la vista, *"ok vamos con la 2"*.

**Lo que hace:** en «+ Nuevo DTE», «Traer factura emitida fuera de Eventia»
(quien tiene las notas, el administrador). Se escribe el N°:
1. «Leer de facturacion.cl»: el motor le pide el PDF a facturacion.cl
   (`ObtenerPdf`, que viene incluido) y lo lee sin IA
   (`facturas-traidas/leer-factura-del-pdf.ts`, sobre los textos con su
   posición de `texto-del-pdf.ts` de §9.29). Medido en la N° 374 de
   producción: el N°, la fecha, el cuadro del cliente (cada valor hasta la
   columna de la derecha, donde van la condición de pago y el vencimiento:
   «CREDITO» no es parte del giro), la referencia («en ORDEN DE COMPRA :
   Nro. … del …»), el detalle bajo «Descripción · Cant. · Precio Unit. ·
   Total» (una fila sin montos sigue la descripción larga) y los totales
   («Exento:» y «Neto:» van en la misma fila).
2. Se mira lo leído: el cliente, la OC y su evento, los ítems y los
   totales.
3. «Traer a Eventia»: queda en la lista como emitida, con «traída de
   facturacion.cl» en su línea chica (`respuesta.traida`; la lista lee solo
   esa marca de la respuesta). Si su OC está en Eventia, queda en ese evento
   y cuenta en «Por facturar». Su PDF es el que ya estaba subido a
   Documentos → Facturas del evento (si el nombre trae su N°, como
   «F374.pdf»); si no, una copia propia con el nombre de §9.35.

Desde la lista se anula o rebaja con su nota, como cualquier otra: la nota
toma sus líneas, su receptor, su N° y su fecha.

**Lo que no se trae:** lo que no cuadra (el neto y el IVA que no suman el
total, un IVA que no es el 19 %, líneas que no suman el neto), un PDF que
no es una factura electrónica de facturacion.cl, una con descuento por
línea, una que ya está en Eventia y, en el modo simulado, nada. Mejor no
traer que traer mal. Sin vencimiento impreso, la condición de pago queda
sin decir.

**Lo que cubren las pruebas:** `facturas-traidas.spec.ts` (la N° 374 con
sus posiciones de producción y datos inventados, el precio con decimales,
la descripción larga, el vencimiento a la derecha del RUT, lo que no
cuadra, y traerla: con su evento, con el PDF ya subido o su copia, dos
veces no, otro N°, simulado) y, en la vitrina, `TraerFactura.test.tsx`.

**En producción desde el 08-11-2026** (PR #322, el motor y la vitrina,
sin migración).

**El nombre que facturacion.cl corta (08-11, esa misma tarde).** Leída en
producción, la N° 375 dijo «CORPORACION CENTRO DE FORMACION TECNICA
SANTO»: el PDF de facturacion.cl deja la razón social en un solo renglón y
lo que no cabe se pierde (el «TOMAS» no está en ninguna parte del PDF; la
N° 374, «CORPORACION INSTITUTO PROFESIONAL SANTO TOMAS», cupo justo). La
nota de crédito copia el nombre de la factura que anula, así que Felipe
eligió *«Sí, con nombre del SII»*: si la nómina del SII (§9.27) tiene,
para el mismo RUT, un nombre que empieza con las palabras del PDF y sigue,
va el del SII (`facturas-traidas/nombre-del-sii.ts`, sin importar tildes,
mayúsculas ni espacios); si dice otro nombre, o no lo tiene, queda el del
PDF. La pantalla lo dice bajo la razón social («Completo según el SII:
facturacion.cl lo cortó en su PDF») y el nombre del PDF queda anotado en
`respuesta.razon_social_del_pdf`. Y como la traída suele ser de un mes
anterior (la 374 es del 30-10 y se trajo el 08-11), la lista vuelve
desde ese mes hasta hoy, con la traída marcada (`ListaDeDocumentos`,
`desde`; si queda a más de un año, solo su mes). La N° 374 se trajo esa
tarde con el motor del PR #322; la 375 se trae con este arreglo.
**En producción desde el 08-11-2026** (PR #323, el motor y la vitrina,
sin migración).

**Las notas de crédito, también (08-11, esa noche).** Al anular la 374
desde Eventia, facturacion.cl respondió *«El documento Tipo 33, folio 374
ya fue anulado previamente»* (la nota quedó rechazada, sin folio). Leídas
la 376 a la 380 sin guardar: la 374 y la 375 se habían anulado en la
página de facturacion.cl y el 30-10 se volvieron a emitir como la 377 (CFT)
y la 378 (IP), con «MENU ADULTO | MENU NIÑO». Felipe: *"nos pidieron
anularlas porque no estaban bien emitidas… y la segunda que hay que emitir
son las que hay que anular… tráete las notas de crédito y las facturas"*.
Las facturas 377 a 380 se trajeron esa noche; para las notas, la puerta
del motor acepta `tipo` 61:
- la NC sale con la misma plantilla, medida en la NC N° 115 de producción
  y en las N° 113 y 114 de la página (que Felipe bajó esa noche: el título
  va en dos renglones, «NOTA DE CREDITO» y «ELECTRONICA», y se lee junto,
  sobre el N°) y, en la referencia, la razón y el
  documento que modifica («Test en FACTURA ELECTRONICA : Nro. 381 del
  08-11-2026»); la referencia se busca por los nombres conocidos, así una
  razón con «en» no se la come;
- el documento que modifica tiene que estar en Eventia (si no, «tráela
  primero»): la nota entra a su cadena (§9.5) con `modifica_id`, su evento
  y su OC, y la factura queda «Anulada por NC N° …»;
- el código de referencia no se imprime (el XML, que lo trae, se cobra
  aparte): se saca de los montos (`nota-traida.ts`): por el total del
  documento anula, en cero corrige un texto, por menos rebaja; por más, no
  se trae. La fila lo anota (`respuesta.codigo_por_los_montos`).

**Sin pantalla (08-11, esa noche).** Felipe: *"sin botón traer, solo
hazlo tú y cárgalo en producción: es un botón que solo se usará esta
vez"*. «Traer factura emitida fuera de Eventia» salió de «+ Nuevo DTE»
(`TraerFactura`, con su nota «Completo según el SII» y la lista que abría
desde el mes de la traída). Queda la puerta del motor
(`POST /facturacion/documentos/traer`, el administrador con el permiso de
las notas), que usó el asistente esa noche para traer la historia de la
#481; si algún día hace falta de nuevo, la pantalla está en la historia
del repositorio (PR #322 y #323). En la lista, lo traído sigue diciendo
«traída de facturacion.cl».

**En producción desde el 08-11-2026** (PR #324, el motor y la vitrina,
sin migración).

### 9.11 Fuentes nuevas (04-11)

- Formato de los Documentos Tributarios Electrónicos del SII, versión 2.2
  de 10-07-2019: https://www.sii.cl/factura_electronica/factura_mercado/formato_dte.pdf
  (la sección «Información de referencia»: los códigos 801 a 820, el N° de
  18 caracteres, la razón de 90, hasta 40 referencias, los códigos 1, 2 y 3,
  y `IndNoRebaja`).
- SII, preguntas frecuentes, «¿Qué documentos y en qué plazos se deben
  emitir, para rebajar o anular documentos tributarios electrónicos?»:
  https://www.sii.cl/preguntas_frecuentes/factura_electronica/001_003_7335.htm
- SII, guía «¿Cómo anular nota de crédito electrónica?»:
  https://www.sii.cl/factura_electronica/factura_sii/guias_ayuda/nota_debito_anula_fe.htm
- SII, Res. Ex. 53 de 2022, que eliminó el resumen de ventas diarias de
  boletas: https://www.sii.cl/normativa_legislacion/resoluciones/2022/reso53.pdf
- La API de Bsale para Chile: https://docs.bsale.dev/documentos
  (`references` con `codeSii`, `salesId`, `sendEmail`, `informedSii`).
- El manual REST de facturacion.cl, releído el 04-11: sigue en la versión
  1.0 de julio de 2026.
- 05-11 (paso 5a): la definición del servicio en vivo
  (https://wss.facturacion.cl/WSDS/wsplano.asmx?wsdl) y su respuesta a
  `Online`, `Version` y a una acción que no existe; y del manual,
  «Integración mediante WebService» (`integracionservicioweb.php`: Base64,
  `logininfo`, `Procesar`, `ObtenerPdf`, `ConsultarCAF`), «Credenciales de
  acceso» (`credencialesacceso.php`), la ficha técnica
  (`fichatecnicaserviciointegracion.php`) y el formato XML de la factura
  (`archivofacturaelectronica.php`: ISO-8859-1).
- 07-11 (§9.25): el «Manual WebService de Compras» de facturacion.cl
  (`archivomanualwscompras.php`: `ObtenerCompra`, `ConsultaPanelDte`,
  `ObtenerPanelDte` y `Acuse`), y la nómina de personas jurídicas del SII
  (https://www.sii.cl/sobre_el_sii/nominapersonasjuridicas.html:
  `PUB_NOMBRES_PJ`, `PUB_NOM_ACTECOS` y `PUB_NOM_DIRECCIONES`, de agosto
  de 2026).
- 08-11 (§9.32), la fecha de emisión: el Formato DTE v2.2 del SII
  (https://www.sii.cl/factura_electronica/factura_mercado/formato_dte.pdf:
  `FchEmis` y la fecha y hora de la firma), la guía del Portal MIPYME
  (https://www1.sii.cl/TMP/InfoP001/GuiaPortalMIPYME_V3.pdf), la pregunta
  del SII sobre facturas con guías de despacho
  (https://www.sii.cl/preguntas_frecuentes/factura_electronica/001_003_4136.htm),
  los plazos del F29
  (https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_1060.htm),
  el rechazo CAF-3-517 (GoSocket) y la nota de Círculo Verde de 2019 sobre
  facturas con fechas distintas a la real.
