# 19 · Facturación electrónica (boletas y facturas desde Eventia)

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
> desde la cotización, y se edita a mano (§9.20).
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
  cabaña que escribe recepción (va en la observación de la boleta) y el
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

**5c, la certificación y el «a producción»** (el paso a paso, revisado
el 05-11):

*Medido ese día:*
- En producción no hay ninguna tabla de facturación y Valle del Sol no
  tiene el módulo.
- Las migraciones 184 y 187 tienen su número libre en `main`; la 187 trae
  también el tarifario.
- La rama va 2 commits detrás de `main`, y al juntarlas solo chocan dos
  mapas del atlas, el 09 y el 18. El código no choca.

*Antes, sin tocar producción:*
1. Felipe pide el paso a producción con «Solicitar», en la pantalla de
   inicio de facturacion.cl. Antes tiene que estar listo el 5b.
2. La certificación toma de 3 a 5 días hábiles.
3. Al terminar llegan las credenciales de producción.

*El día del «a producción», en este orden:*
1. **Respaldo:** `modulos_propios` de la empresa 1, en
   `02_RESPALDOS/cambios_de_datos`.
2. **Base de producción:** las migraciones 184 y 187 (la 184b es solo del
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
   Variables:
   - las tres de «Ambiente Producción»;
   - `FACTURACIONCL_AMBIENTE` = `produccion`;
   - `FACTURACIONCL_EMPRESA` = `1`.

   Después aprieta «Deploy». El registro tiene que decir «conectado en
   produccion para la empresa 1».
7. **«Probar la conexión»** muestra los folios de producción de cada tipo.

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
