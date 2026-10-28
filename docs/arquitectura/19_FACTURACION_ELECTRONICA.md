# 19 · Facturación electrónica (boletas y facturas desde Eventia)

> **Estado: PLAN para aprobar (26-10-2026). No hay nada construido.**
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
| L3 | Si alguien emite en la plataforma web al mismo tiempo, el folio avanza y la respuesta es *"Ya existe el Documento del TipoDTE = 33 con Folio = N"*. | Choque de folios. | El folio se consulta justo antes de emitir. Si choca, se consulta una vez más; si vuelve a chocar, se avisa. |
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
| D3 | ¿De dónde sale el valor de la boleta de cabaña? Hoy el catálogo no tiene las tarifas de las cabañas: solo «Alojamiento temporada…» por persona y una «Cabaña 3H 2B». | Agregar un tarifario de cabañas: 2, 4 y 6 personas por temporada, persona adicional y tinaja. Que solo el administrador pueda escribir el monto a mano. |
| D4 | En una factura sin OC, ¿el % se calcula sobre el total del evento? | Sí. |
| D5 | ¿Quién emite cada documento? | Boletas: de recepción hacia arriba. Facturas y notas de crédito: el administrador. |
| D6 | ¿Los eventos de particulares (matrimonios) también se boletean desde la ficha del evento? | Sí, en el paso 3. |
| D7 | ¿Se paga `ConsultaLibroVentas` para cuadrar solos con el libro de ventas? | No al partir; se ve después del primer mes. |
| D8 | ¿El monto de la OC se anota con IVA incluido? | Sí, como todo en Eventia. La OC de Mercado Público trae el neto, el IVA y el total. |
| D9 | ¿Eventia le pregunta directo al SII si aceptó cada documento? (Felipe, 27-10.) El servicio `QueryEstDte` del SII recibe el RUT, el tipo, el folio, la fecha y el monto, y responde: recibido (DOK), recibido con datos que no coinciden (DNK), no recibido (FAU), no autorizado (FNA), anulado (FAN), o modificado o anulado por una nota de crédito o débito. Pero exige la «autenticación automática» con un **certificado digital**: Eventia tendría que guardar el certificado y su clave en el servidor. | Al partir, no: Eventia sigue sin ver el certificado. Primero se le pregunta a soporte de facturacion.cl si `ConsultarEstado` entrega el estado del SII. Guardar el certificado en Eventia lo decide Felipe (son sus claves). |

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

**`clients`** suma estas columnas:
- `rut`;
- `razon_social`;
- `giro`;
- `direccion_facturacion`;
- `comuna`;
- `ciudad`;
- `correo_facturacion`.

`address` es un dato muerto y no se reusa.

**`ordenes_de_compra`** (tabla nueva) guarda:
- la empresa y la cotización;
- el N°, la fecha y la descripción;
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
- `FACTURACIONCL_AMBIENTE` (prueba o producción).

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

## 6. Pasos (sprints cortos)

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
