# Mapa: Marketing por correo

> **Estado: verificado una vez contra el código** (commit 0de0ddb, 11-09-2026). Falta la etapa de completar lo que no quedó escrito. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué hace

Es el correo masivo de Eventia, hecho en casa sobre Resend (sin Brevo). El administrador arma **audiencias** con los datos que el sistema ya tiene (clientes, sus contactos y la historia de sus cotizaciones) o importa listas de afuera, como las cabañas. Después escribe una **campaña** con la plantilla de la marca, se manda una **prueba obligatoria** a su casilla y la envía al tiro o la **programa** para un día y hora, con una recomendación de horario para cada audiencia. En la ficha de la campaña ve quién la recibió, la abrió, hizo clic, rebotó o se dio de baja, y puede hacer **una sola segunda pasada** a los que no abrieron, con asunto nuevo. No acompaña un evento puntual: se usa antes de la venta (reactivar clientes dormidos, aniversarios, temporada) y siempre respeta la baja obligatoria. Solo lo ve el administrador. Ojo: su plantilla (`plantillaCampana`) y su marca (`marcaDesdeFila`) también visten el correo del embudo de consultas y el de "Enviar cotización".

## 2. Pantallas y rutas de la app

| Ruta de la app | Componente principal | Archivo | Qué hace el usuario ahí | Rol que la ve |
|---|---|---|---|---|
| `/marketing` (pestaña Campañas, la de entrada) | `MarketingPage` → `Campanas` | `frontend/src/pages/marketing/MarketingPage.tsx` | Historial en tabla (N°, fecha de envío, campaña y asunto, audiencia, destinatarios, estado Borrador/Programada/Enviada) con buscador y orden por N° o por fecha. Un clic en la fila abre la ficha. Botón "+ Nueva campaña" | administrador: `SECTION_ROLES.marketing` = `ROLE_GROUPS.ADMIN_ONLY` (`frontend/src/constants/permissions.ts`), aplicado con `PermissionGuard` en `frontend/src/App.tsx` |
| (dentro de Campañas) | `NuevaCampana` + `CampanaMarcaPropia` | `MarketingPage.tsx`, `CampanaMarcaPropia.tsx`, `audienciasDeCampana.ts` | Elige una o varias audiencias (`MultiSelect`), escribe nombre interno, asunto, preencabezado, título y cuerpo, con botones que insertan `{nombre}` y `{empresa}`. Opcional: banner y WhatsApp propios. Guarda como borrador | igual |
| `/marketing` (pestaña Audiencias) | `MarketingPage` → `Audiencias` | `MarketingPage.tsx` | La estantería: guardadas (chip "De tu base", conteo de hoy) e importadas (chip "Importada", "N contactos · M bajas"). Lápiz para renombrar, ojito para ver adentro, basurero para borrar. Más abajo, "Nueva audiencia desde tu base" e "Importar audiencia" (archivo o pegado) | igual |
| (dentro de Audiencias) | `SegmentoBuilder` | `SegmentoBuilder.tsx` | Tres filtros ("Qué pasó con ellos", tipo de cliente, tipo de evento) y la previa en vivo con cliente, contacto y correo | igual |
| (dentro de Audiencias) | `VerAudiencia` (usa `Modal`) | `MarketingPage.tsx` | Ver quiénes están dentro. En las importadas, las bajas salen en gris y se puede "Sacar" un contacto | igual |
| (dentro de Audiencias) | lector de archivos | `leerArchivoDeContactos.ts` | Convierte .txt, .csv o .xlsx en líneas `correo,nombre,empresa` para la caja de importar | igual |
| `/marketing/campana/:id` | `CampanaFichaPage` | `frontend/src/pages/marketing/CampanaFichaPage.tsx` | La ficha. En borrador: "Prueba a mi casilla", "Programar envío" y "Enviar" (estos dos, cerrados sin prueba), "Editar" y "Eliminar". En enviada: seis cajas de indicadores, tabla de destinatarios con filtros (todos, abrieron, clicaron, sin abrir, rebotes) y "Reenviar a los que no abrieron". Siempre: el correo en un `iframe` de 600 px | igual |
| (dentro de la ficha) | `EditorDeBorrador` | `EditorDeBorrador.tsx` | Editar asunto, preencabezado, título, cuerpo, audiencias y marca propia del borrador. Avisa que guardar invalida la prueba | igual |
| (dentro de la ficha) | `BotonProgramar` y `CajaProgramada` | `ProgramarEnvio.tsx` | Ventana con la recomendación de horario por audiencia, fecha (`input type="date"`) y hora (`HoraInput`). En una programada: cancelar o "Enviar ahora" | igual |
| Sin ruta de la app: `GET /marketing/baja` | página HTML armada por el motor | `api-rest/src/marketing/marketing.controller.ts` (`bajaConfirmar`) | El destinatario confirma "Sí, darme de baja" | pública, sin sesión |

Notas:

- Entrada del menú: `frontend/src/layout/Sidebar.tsx` ("Marketing", sección `marketing`, precarga `MarketingPage`). Las dos páginas son `React.lazy` en `App.tsx`.
- La pantalla recuerda pestaña, búsqueda y orden en `sessionStorage` (`mk.pestana`, `mk.busca`, `mk.sortCol`, `mk.sortDir`) y el filtro de cada ficha (`mk.ficha.<id>.filtro`).
- La marca que viste los correos se configura en Configuración: `CompanyConfiguration.tsx` (canales, logo, banner, colores) y `ConfigurationPage.tsx` ("Responder a"). Eso es de `15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md`.

## 3. Endpoints del motor

Todos viven en `MarketingController` (`api-rest/src/marketing/marketing.controller.ts`), con `@Roles(...ADMIN_ONLY)` en la clase (revisión 26-08). Las tres rutas `@Public()` pasan igual porque `RolesGuard` (`api-rest/src/auth/roles.guard.ts`) deja ir primero lo público. En la app, todo pasa por `frontend/src/services/marketing.service.ts` con la base `API_ROUTES.MARKETING = "/marketing"`. El freno general es de 300 por minuto (`ThrottlerModule.forRoot` en `app.module.ts`), salvo donde se indica otro.

| Método y ruta | Controller y método | Service | Quién lo llama desde la app | Roles o @Public |
|---|---|---|---|---|
| `GET /marketing/audiencias` | `audiencias` | `AudienciasService.listarAudiencias`, `audienciasImportadas`, `tiposDeCliente`, `tiposDeEvento` | `getAudienciasMarketing` desde `MarketingPage` (solo con la pestaña Audiencias abierta o creando campaña) y `EditorDeBorrador` | administrador |
| `GET /marketing/audiencias/importada?nombre=` | `contactosDeImportada` | `AudienciasService.contactosDeImportada` | `contactosDeAudienciaImportada` desde `VerAudiencia` | administrador |
| `POST /marketing/audiencias` | `crearAudiencia` | `AudienciasService.crearAudiencia` | `crearAudienciaMarketing` desde `Audiencias` | administrador |
| `PATCH /marketing/audiencias/importada` | `renombrarImportada` | `AudienciasService.renombrarImportada` | `renombrarAudienciaImportada` (lápiz) | administrador |
| `PATCH /marketing/audiencias/:id` | `renombrarAudiencia` | `AudienciasService.renombrarAudiencia` | `renombrarAudienciaGuardada` (lápiz) | administrador |
| `DELETE /marketing/audiencias/importada/contacto?nombre=&email=` | `borrarContactoImportado` | `AudienciasService.borrarContactoImportado` | `eliminarContactoImportado` desde `VerAudiencia` | administrador |
| `DELETE /marketing/audiencias/importada?nombre=` | `borrarImportada` | `AudienciasService.borrarImportada` (no toca bajas) | `eliminarAudienciaImportada` | administrador |
| `DELETE /marketing/audiencias/:id` | `borrarAudiencia` | `AudienciasService.borrarAudiencia` | `eliminarAudienciaMarketing` | administrador |
| `POST /marketing/segmento/previa` | `previaSegmento` | `AudienciasService.previaSegmento` → `resolverSegmentoDe` (muestra de hasta 500) | `previaSegmento` desde `SegmentoBuilder` y desde `VerAudiencia` (guardadas) | administrador |
| `POST /marketing/contactos/importar` | `importar` | `AudienciasService.importarContactos` | `importarContactosMarketing` | administrador |
| `GET /marketing/campanas` | `campanas` | `MarketingService.campanas` | `getCampanasMarketing` desde `MarketingPage` | administrador |
| `POST /marketing/campanas` | `crear` | `MarketingService.crearCampana` | `crearCampanaMarketing` desde `NuevaCampana` | administrador |
| `PATCH /marketing/campanas/:id` | `editar` | `MarketingService.editarCampana` (solo borrador; invalida la prueba) | `editarCampanaMarketing` desde `EditorDeBorrador` | administrador |
| `DELETE /marketing/campanas/:id` | `borrarCampana` | `MarketingService.borrarCampana` (solo borrador) | `eliminarCampanaMarketing` desde `CampanaFichaPage` | administrador |
| `GET /marketing/campanas/:id/destinatarios` | `destinatarios` | `MarketingService.destinatariosDe` | `destinatariosDeCampana` (la pregunta "¿Enviar a N?") | administrador |
| `POST /marketing/campanas/:id/prueba` | `prueba` | `MarketingService.enviarPrueba` (marca vía `empresaDe`) | `enviarPruebaCampana` | administrador |
| `POST /marketing/campanas/:id/programar` | `programar` | `MarketingService.programarCampana` | `programarCampana` desde `BotonProgramar` | administrador |
| `DELETE /marketing/campanas/:id/programar` | `cancelarProgramacion` | `MarketingService.cancelarProgramacion` | `cancelarProgramacion` desde `CajaProgramada` | administrador |
| `GET /marketing/campanas/:id/recomendacion-horario` | `recomendacionHorario` | `MarketingService.recomendacionesDe` | `recomendacionHorario` desde `BotonProgramar` | administrador |
| `POST /marketing/campanas/:id/enviar` | `enviar` | `MarketingService.enviarCampana` (copia a `user.email`) | `enviarCampana` desde `CampanaFichaPage` (borrador, o "Enviar ahora" de una programada) | administrador |
| `GET /marketing/campanas/:id/detalle` | `detalle` | `MarketingService.detalleDe` | `detalleDeCampana` | administrador |
| `GET /marketing/campanas/:id/html` | `html` | `MarketingService.htmlDe` | `htmlDeCampana` (el `iframe`) | administrador |
| `GET /marketing/campanas/:id/resultados` | `resultados` | `MarketingService.resultadosDe` | **Nadie.** `resultadosDeCampana` existe en el servicio de la app, pero ninguna pantalla la llama | administrador |
| `GET /marketing/campanas/:id/sin-abrir` | `sinAbrir` | `MarketingService.sinAbrirDe` | `sinAbrirDeCampana` (abre el modal de reenvío) | administrador |
| `POST /marketing/campanas/:id/reenviar` | `reenviar` | `MarketingService.reenviarANoAbiertos` | `reenviarCampana` | administrador |
| `POST /marketing/webhook` | `webhook` | `BajasService.verificarFirmaSvix` + `procesarEventoResend` | Resend (externo), no la app | `@Public()`, `@Throttle` 1200 por minuto |
| `GET /marketing/baja?c=&e=&t=&ca=` | `bajaConfirmar` | `BajasService.bajaValida` (no suprime) | el link del pie del correo, en el navegador del destinatario | `@Public()`, `@Throttle` 10 por minuto |
| `POST /marketing/baja?c=&e=&t=&ca=` | `bajaEjecutar` | `BajasService.procesarBaja` → `MarketingRepository.suprimir` | el botón de la página de confirmación, y el "Darse de baja" de Gmail u Outlook (cabecera `List-Unsubscribe-Post`) | `@Public()`, `@Throttle` 10 por minuto |

Sin endpoint: el reloj `MarketingCronService.despacharProgramadas` (`api-rest/src/marketing/marketing-cron.service.ts`).

## 4. Tablas de la base de datos

| Tabla | Qué guarda | Lee o escribe | Migración que la crea o modifica |
|---|---|---|---|
| `marketing_campaigns` | La campaña: nombre, asunto, título, cuerpo, preencabezado, `audiencias` (jsonb) más columnas espejo de la primera audiencia, estado `borrador`/`programada`/`enviada`, `prueba_enviada_at`, `enviada_at`, `total_destinatarios`, `reenviada_con_asunto`, `banner_url`, `whatsapp`, `programada_para`, `programada_por` | Lee y escribe: `crearCampana`, `campana`, `campanas`, `actualizarCampana`, `borrarCampana`, `programadasVencidas`, `tomarProgramada`, `aperturasPorCampana` | 91 (crea), 92 (tipo `segmento` en el CHECK, `filtro`), 93 (`audiencia_id` con FK ON DELETE SET NULL, `preencabezado`, `reenviada_con_asunto`), 99 (`audiencias`), 101 (`banner_url`, `whatsapp`), 103 (`programada_para`, `programada_por`, CHECK de estado con `programada`) |
| `marketing_sends` | Una fila por destinatario por campaña: email, name, empresa, estado `enviado`/`fallido`, error, `resend_id` y los sellos `opened_at`, `clicked_at`, `bounced_at`, `reenviado_at` | Lee y escribe: `registrarEnvios`, `marcarEvento`, `marcarReenviados`, `enviosDe`, `sinAbrirDe`, `destinatariosDetalle`, `resultadosDe`, `aperturasPorCampana` | 91 (crea; índice único `marketing_sends_una_vez` sobre `campaign_id, lower(email)`; FK a la campaña ON DELETE CASCADE), 92 (sellos), 97 (`empresa`) |
| `marketing_contacts` | Audiencias importadas: etiqueta `audiencia`, email, name, empresa y `datos` jsonb (sin uso) | Lee y escribe: `importarContactos` (upsert), `contactosImportados`, `contactosDeAudiencia`, `contarImportada`, `renombrarImportada`, `borrarImportada`, `borrarContactoImportado` | 91 (crea), 94 (índice único por columnas `company_id, audiencia, email`) |
| `marketing_suppressions` | La lista de supresión: email, motivo `baja`/`rebote`, `campaign_id` de origen | Lee y escribe: `suprimir` (upsert que ignora duplicados), `suprimidos`, `bajasDe`. El código nunca borra filas acá | 91 (crea), 94 (índice único por columnas `company_id, email`), 98 (`campaign_id`) |
| `marketing_audiences` | Audiencias guardadas: nombre y `filtro` jsonb (la pregunta, no la lista) | Lee y escribe: `crearAudiencia`, `audienciasGuardadas`, `audienciaGuardada`, `renombrarAudiencia`, `borrarAudiencia` | 93 (crea; único `company_id, lower(nombre)`) |
| `clients` | Fichas: id, name, email, client_type, contact_person | Solo lee: `clientesSegmentables`, `clientesPorTipo`, `tiposDeCliente` | ver `09_CLIENTES.md` |
| `client_contacts` | Las personas de cada ficha, con correo | Solo lee: `contactosDeClientes` | ver `09_CLIENTES.md` |
| `quotations` | client_id, quotation_status, event_date, total_amount, event_type, created_at | Solo lee: `cotizacionesSegmentables`, `tiposDeEvento` | ver `01_COTIZADOR.md` y `02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md` |
| `companies` | La marca: name, logo_url, banner_url, tagline, whatsapp, instagram, facebook, sitio_web, colors, notifications.replyTo | Solo lee: `CompaniesRepository.findOne` (select completo) y `marcaDesdeFila` | 95 (whatsapp, instagram, facebook, sitio_web), 96 (banner_url); el resto en `15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md` |
| Almacenamiento: balde `company-logos` | Banner propio de campaña, `<empresa>_campaign_banner_<marca de tiempo>.<ext>`, público | Escribe desde la app: `uploadCampaignBanner` → `StorageService` con `kind: 'campaign-banner'` | sin migración |

Las migraciones que crean tablas nuevas (91, 93) traen su `GRANT ... TO service_role` (lección de la 91: sin ellos el módulo respondía 42501); varias de las que solo alteran columnas lo reafirman por las dudas (97, 98, 99, 101), pero no todas — 92, 94, 95, 96 y 103 no llevan GRANT. Se corren a mano en Supabase.

## 5. Flujos principales

### 5.1 Armar una audiencia (guardada o importada)

Guardada:

1. Pestaña Audiencias → `SegmentoBuilder` cambia el `FiltroSegmento` y, tras 350 ms quieto, llama `previaSegmento` → `POST /marketing/segmento/previa` → `AudienciasService.previaSegmento` → `resolverSegmentoDe`, que trae `clientesSegmentables` y `contactosDeClientes`, y `cotizacionesSegmentables` solo si el filtro mira cotizaciones → `resolverSegmento` (pura, `segmento.ts`) → descuenta `repo.suprimidos` → devuelve el total y hasta 500 filas.
2. Nombre + "Guardar audiencia" → `crearAudienciaMarketing` → `POST /marketing/audiencias` → `AudienciasService.crearAudiencia` → `MarketingRepository.crearAudiencia` → `marketing_audiences`. Se guarda el filtro, no la lista. Un nombre repetido da 23505 y el motor responde "Ya existe una audiencia con ese nombre".
3. La app invalida todo lo que empieza con `["marketing"]` → `GET /marketing/audiencias` → `AudienciasService.listarAudiencias` recalcula CADA guardada contra toda la base (un viaje por clientes, cotizaciones, contactos y bajas). Es la consulta pesada del módulo: la app solo la pide con la pestaña Audiencias abierta o al crear campaña, y la guarda 5 minutos.

Importada:

1. "Elegir archivo…" → `leerArchivoDeContactos` (el Excel pasa por `filasALineas`, que busca las columnas por nombre) o texto pegado → `parsearContactos` en `MarketingPage.tsx` muestra conteo y vista previa.
2. "Importar" → `importarContactosMarketing` → `POST /marketing/contactos/importar` → `AudienciasService.importarContactos` (pasa a minúsculas, valida con regex, quita repetidos del archivo) → `MarketingRepository.importarContactos`, upsert con `onConflict: company_id,audiencia,email` → `marketing_contacts`. Reimportar la misma etiqueta no duplica. Responde importados, duplicados en el archivo e inválidos.

### 5.2 Crear, probar y enviar una campaña

1. `NuevaCampana` → `unaAudiencia` traduce cada código elegido: `"todos"` = segmento con filtro vacío y rótulo "Todos los clientes"; `"g:<id>"` = guardada; `"i:<nombre>"` = importada → `crearCampanaMarketing` → `POST /marketing/campanas` → `MarketingService.crearCampana` → `normalizarAudiencia` por cada audiencia (en las guardadas trae nombre y FOTO del filtro con `repo.audienciaGuardada`) → `repo.crearCampana` → fila en `marketing_campaigns` en `borrador`, con la lista en `audiencias` y las columnas espejo (primera audiencia; `audiencia_ref` = nombres unidos con " + ", cortado a 120).
2. En la ficha, "Prueba a mi casilla" → `POST .../prueba` → `MarketingController.empresaDe` (`CompaniesRepository.findOne` → `marcaDesdeFila`; si la consulta falla con algo distinto de `PGRST116`, responde 503 y no sale nada) → `MarketingService.enviarPrueba` → `renderizar` (personaliza como "Prueba", aplica banner y WhatsApp propios, arma `urlDeBaja` y `urlDeCotizar`) → Resend `emails.send` con asunto `[PRUEBA] …`, cabeceras `List-Unsubscribe` y `replyTo` → `actualizarCampana` marca `prueba_enviada_at`.
3. "Enviar" → `GET .../destinatarios` (`destinatariosDe`: candidatos menos suprimidos menos ya enviados; no cuenta la copia) → "¿Enviar a N destinatarios?" → `POST .../enviar` → `MarketingService.enviarCampana`:
   - exige estado `borrador` o `programada`, y `prueba_enviada_at`;
   - `candidatosDe` junta todas las audiencias: importada → `repo.contactosDeAudiencia`; segmento → el filtro DE HOY de la guardada si tiene `audiencia_id` (si la borraron, la foto) → `AudienciasService.resolverSegmentoDe`; tipo viejo `clientes` → `repo.clientesPorTipo`;
   - `resolverDestinatarios(candidatos, suprimidos, enviosDe)`; si queda vacía, error "La audiencia quedó vacía";
   - agrega la copia del capitán (`user.email`) si no estaba;
   - lotes de 40 (`LOTE`) con `resend.batch.send`; por lote, `repo.registrarEnvios` en `marketing_sends` (`enviado` con su `resend_id`, o todo el lote `fallido` con el error);
   - `actualizarCampana`: `estado = enviada`, `enviada_at`, `total_destinatarios` = enviados, `programada_para = null`.
4. La app avisa "Campaña enviada a N · M fallidos" y refresca. No hay efectos sobre clientes ni cotizaciones.

### 5.3 Programar el envío y el reloj del motor

1. `BotonProgramar` (cerrado sin prueba) abre la ventana → `GET .../recomendacion-horario` → `MarketingService.recomendacionesDe`: `repo.aperturasPorCampana` (campañas enviadas y sus `opened_at`); junta las aperturas de campañas pasadas a la misma audiencia (`mismaAudiencia`: por `audiencia_id` o por `audiencia_ref`). Con 30 o más (`UMBRAL_APERTURAS`) usa `mejorVentana` (día de semana por bloque de 2 horas, en `America/Santiago`); si no, `RECOMENDACION_ESTUDIOS[publicoDeAudiencia(...)]`.
2. Fecha y hora → `new Date("<fecha>T<hora>:00")` en la hora del navegador → ISO → `POST .../programar` (`ProgramarCampanaDto.cuando`, `@IsISO8601`) → `programarCampana`: solo borrador, con prueba, y la hora al menos un minuto en el futuro → `estado = programada`, `programada_para`, `programada_por = user.email`.
3. La ficha muestra `CajaProgramada`: "Cancelar programación" → `DELETE .../programar` → `cancelarProgramacion` (vuelve a borrador y limpia las dos columnas); o "Enviar ahora" → el mismo `POST .../enviar`, que acepta `programada` y anula la programación.
4. El reloj: `MarketingCronService.despacharProgramadas` (`@Cron(EVERY_MINUTE)`, activo solo con `NODE_ENV === 'production'` por `ScheduleModule.forRoot({ cronJobs })` en `app.module.ts`) → `repo.programadasVencidas` (sin `company_id` a propósito: barre todas las empresas) → por cada una, `repo.tomarProgramada` (update condicionado a `estado = programada` que la deja en borrador con `programada_para` nulo; si no devuelve fila, otro reloj se la llevó) → `CompaniesRepository.findOne` → `marcaDesdeFila` → `MarketingService.enviarCampana(..., programada_por)`. Si algo lanza error, la campaña queda en borrador y el error va al log; no hay reintento.

### 5.4 Lo que vuelve: webhook de Resend y baja

1. Resend → `POST /marketing/webhook` con `svix-id`, `svix-timestamp` y `svix-signature` → `BajasService.verificarFirmaSvix` sobre el cuerpo crudo (`rawBody: true` en `api-rest/src/main.ts`). Sin `RESEND_WEBHOOK_SECRET`: producción rechaza y los otros ambientes aceptan sin verificar. Con secreto: tolerancia de 5 minutos y HMAC. Firma inválida → responde `{ ok: false }` y no procesa.
2. `BajasService.procesarEventoResend`: `email.opened` → `opened_at`; `email.clicked` → `clicked_at` y `opened_at`; `email.bounced` o `email.complained` → `bounced_at`; el resto se ignora → `repo.marcarEvento` actualiza `marketing_sends` por `resend_id` (si el id no es de una campaña, no toca nada).
3. Rebote o queja → `repo.suprimir(empresa, correo, 'rebote', campaign_id)` → `marketing_suppressions`.
4. Baja: el pie del correo lleva `urlDeBaja` = `<baseApi>/marketing/baja?c=<empresa>&e=<correo en base64url>&t=<HMAC de 32 hex>&ca=<campaña>`. `GET /marketing/baja` → `bajaValida` → página con botón, sin suprimir → `POST /marketing/baja` → `procesarBaja` → `repo.suprimir(..., 'baja', ca)`. Gmail y Outlook pueden llamar el POST directo gracias a `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (`cabecerasDeBaja`).

### 5.5 La ficha y la segunda pasada

1. `CampanaFichaPage` → `GET .../detalle` → `MarketingService.detalleDe`: `repo.destinatariosDetalle` + `repo.bajasDe` → indicadores (entregados = enviados menos rebotes; apertura, clics y bajas sobre entregados; CTOR = clics sobre aperturas; rebote sobre enviados) y cada destinatario con su marca `baja`.
2. `GET .../html` → `MarketingService.htmlDe` dibuja la campaña con la marca de HOY y un destinatario ficticio (`vista-previa@eventia`) para el `iframe` con `sandbox=""`.
3. "Reenviar a los que no abrieron" (solo en enviada, sin `reenviada_con_asunto`, y con alguien sin abrir ni rebotar) → `GET .../sin-abrir` → modal con "enviada hace X días" (ámbar bajo 2, verde de 2 a 7, gris sobre 7) y asunto propuesto `¿Lo viste? <asunto>` → `POST .../reenviar` → `MarketingService.reenviarANoAbiertos`: exige `enviada` y sin segunda pasada previa; pendientes = `repo.sinAbrirDe` (enviado, sin abrir, sin rebote, sin reenvío) menos suprimidos; `validarAsuntoDeReenvio` → lotes de 40 → `repo.marcarReenviados` (`reenviado_at`) → guarda `reenviada_con_asunto`. No pide prueba nueva ni manda copia al capitán.

## 6. Reglas de negocio acordadas

**Las reglas de fierro (doc 11, acordado con Felipe el 25-08-2026, "ok vamos")**

- Marketing LEE el CRM y jamás le escribe; los contactos importados viven en tablas propias. Evidencia: doc 11, regla 1; en `MarketingRepository` las consultas a `clients`, `client_contacts` y `quotations` son solo `select`.
- Baja obligatoria (ley chilena de correos comerciales) y ninguna campaña se la salta. Evidencia: doc 11, regla 2; línea "Dejar de recibir estos correos" en `plantillaCampana`; `resolverDestinatarios`; prueba "NINGUNA campaña se salta la lista de supresión (regla 2)" en `resolver-destinatarios.spec.ts`.
- Una baja es para siempre: borrar una importada no toca las supresiones, y el código no tiene ningún borrado sobre `marketing_suppressions`. Evidencia: comentarios de `AudienciasService.borrarImportada` y `MarketingRepository.borrarImportada`.
- Regla de una vez: un correo nunca recibe dos veces la misma campaña. Evidencia: doc 11, regla 3; índice `marketing_sends_una_vez` (migración 91); `repo.enviosDe` + `resolverDestinatarios`; prueba "la regla de una vez".
- Sin prueba no hay envío (regla 4). Editar un borrador INVALIDA la prueba (Felipe 26-08: la regla "vale para la versión REAL del correo") y programar exige lo mismo. Evidencia: `enviarCampana`, `editarCampana` (`prueba_enviada_at: null`), `programarCampana`; botones deshabilitados en `CampanaFichaPage` y `BotonProgramar`.
- Reputación separada: el masivo debería salir por un remitente propio (`MARKETING_FROM`). Mientras no exista, sale como `<Empresa> <hola@eventi-app.com>`, anotado como deuda. Evidencia: doc 11, regla 5; `MarketingService.remitente`.
- Sin editor libre, sin journeys, sin A/B: plantilla con campos. Evidencia: doc 11, regla 6 y "Lo que a propósito NO se trajo"; comentario de `plantillaCampana` ("Sin editor libre: campos, a propósito").

**Audiencias**

- La audiencia es una PREGUNTA guardada con nombre (modelo Mailchimp, validado por Felipe el 25-08). Se recalcula al mirarla y al enviar ("si mañana entran 2 que calzan, quedan adentro solos") y la campaña guarda una foto del filtro por si la audiencia se borra. Evidencia: doc 11, puntos 1 y 2; migración 93; `MarketingService.candidatosDeUna`.
- A personas, no a fichas (26-08; a la pregunta de Felipe "¿se envía uno a cada uno?", sí). Cada cliente que calza se abre a todos sus `client_contacts` con correo; si no tiene, respaldo al correo de la ficha. `{nombre}` es la persona y `{empresa}` el cliente, y cada correo cuenta una sola vez desde la fuente. Evidencia: `resolverSegmento` en `segmento.ts`; bloque "a personas" de `segmento.spec.ts`.
- Varias audiencias por campaña (27-08): se juntan, y quien está en dos recibe un solo correo. Evidencia: `MarketingService.candidatosDe`; migración 99; texto de ayuda en `NuevaCampana`.
- Nombres de negocio de Felipe: "Qué pasó con ellos", "Nos compró" (aceptada y realizada) y "No nos compró" (rechazada y cancelada). El estado real es `cancelada`; `anulada` se acepta como alias de filtros viejos (revisión 26-08). Evidencia: `ACEPTO` y `NO_ACEPTO` en `SegmentoBuilder`; `FiltroSegmento` en `segmento.ts`; `QuotationStatus.CANCELADA` en `api-rest/src/quotations/constants/constants.ts`.
- La pantalla deja solo tres filtros (Felipe, 25-08). Evidencia: comentario de cabecera de `SegmentoBuilder`.
- Números honestos: las importadas muestran contactos con las bajas descontadas y a la vista ("2 contactos · 1 baja"), y el ojito marca las bajas en gris en vez de esconderlas. Evidencia: `AudienciasService.audienciasImportadas` y `contactosDeImportada`.
- Renombrar una importada con un nombre ya ocupado se rechaza: "nada de fusiones silenciosas". Evidencia: `AudienciasService.renombrarImportada`.

**Contenido y plantilla**

- `{nombre}` y `{empresa}` sirven en asunto, preencabezado, título y cuerpo; si falta el dato van "estimado cliente" y "su organización". Evidencia: `personalizar`; prueba en `resolver-destinatarios.spec.ts`.
- `*negrita*` y `_cursiva_`, el idioma de WhatsApp (Felipe 26-08), aplicados después del escape. Evidencia: `formatoWhatsApp` y `cuerpoAHtml`; pruebas en `audiencias-y-reenvio.spec.ts`.
- Dos botones por defecto: "Cotiza aquí" al formulario público de la empresa (decisión de Felipe 25-08) y WhatsApp verde si hay número. Los dos miden 250 px (Felipe 02-09: "¿podrían tener el mismo ancho?"). Evidencia: `MarketingService.urlDeCotizar`; `boton` dentro de `plantillaCampana`.
- Banner y WhatsApp propios por campaña (Felipe 28-08) mandan sobre la marca, en un único punto que cubre prueba, envío, segunda pasada y vista. Evidencia: `MarketingService.renderizar`; migración 101.
- Con banner, la imagen reemplaza el encabezado completo. Los íconos de redes son imágenes para verse iguales en modo oscuro (Felipe 25-08). Evidencia: `plantillaCampana`; migración 96; `frontend/public/correo/*.png`.
- Todo en tablas por Outlook de escritorio (Felipe, 10-09-2026: "las respuestas se están viendo así"): tabla dentro de tabla con `bgcolor`, botones como celdas con `mso-padding-alt`, "ghost tables" de 600 px. Evidencia: comentario "TODO EN TABLAS, POR OUTLOOK DE ESCRITORIO" en `plantillaCampana`; commit f92be99; pruebas "la estructura va en TABLAS" y "los botones son celdas".
- Colores legibles con cualquier paleta (revisión 26-08): el nombre sobre el color primario elige solo entre blanco y negro, y la franja usa el secundario solo si es claro. Evidencia: `esClaro`, `textoSobre`; bloque de pruebas "colores legibles".
- Todo dato se escapa al entrar al HTML y el asunto va crudo; escapar dos veces mostraba `&amp;`. Evidencia: comentarios de `esc` y `personalizar`.
- Las respuestas llegan a la casilla real: `replyTo` sale de Configuración → Notificaciones (26-08). Evidencia: `notifications.replyTo` en `marcaDesdeFila`; `enviarPrueba`, `enviarCampana`.
- Si falla la lectura de la marca, no se despacha con marca genérica (revisión 26-08). Evidencia: `MarketingController.empresaDe` (503); comentario en `MarketingCronService`.

**Envío, programación y resultados**

- La copia del capitán (Felipe 26-08): toda campaña real le llega también a quien la despacha, registrada como un envío más; en las programadas, a quien programó. Evidencia: `copiaPara` en `enviarCampana`; `programada_por` en `MarketingCronService`; migración 103.
- La enviada es registro histórico: no se edita ni se borra (Felipe 26-08 y 28-08). Evidencia: `editarCampana`, `borrarCampana`.
- Tope de la industria (Felipe 26-08): máximo dos envíos por campaña. La segunda pasada va solo a quienes no abrieron (sin rebote ni baja), exige un asunto distinto del original, y el manual sugiere hacerla entre 2 y 7 días después. Evidencia: `reenviarANoAbiertos`; `validarAsuntoDeReenvio` con pruebas; modal de `CampanaFichaPage`.
- El rebote duro o la queja suprimen solos (Fase 2). Evidencia: `BajasService.procesarEventoResend`.
- Indicadores de la industria, con tasas sobre entregados (Felipe 26-08). Evidencia: `MarketingService.detalleDe`; referencias de "sano" en las cajas de `CampanaFichaPage`.
- Programar (04-09-2026, "ok vamos"): ruta B, el reloj del motor, porque el `scheduled_at` de Resend no programa lotes. La programada no se edita; cancelar la devuelve a borrador sin perder nada; si el despacho falla queda en borrador y en el log, sin reintentos; el disparo real se valida en producción con una audiencia de una sola persona. Evidencia: doc 11, capítulo "Programar envío"; `MarketingCronService`; `MarketingRepository.tomarProgramada`.
- Recomendación de horario por audiencia (regla de Felipe): con 30 o más aperturas propias manda el dato. Si no, "Martes o jueves, 9:30–11:00" para público de oficina y "Martes a jueves, 17:00–19:00" para público de casa; con mezcla o sin señales, casa. El paseo de curso lo cotiza el apoderado, no el colegio. Evidencia: `programacion.ts`; `programacion.spec.ts`.
- Los filtros de las pantallas se recuerdan al navegar (Felipe 26-08). Evidencia: `sessionStorage` en `MarketingPage` y `CampanaFichaPage`.

**Seguridad y acceso**

- Solo administrador, en la app y en el motor (revisión 26-08: antes, cualquier sesión podía exportar correos o disparar campañas por API). Evidencia: `@Roles(...ADMIN_ONLY)` en `MarketingController`; `SECTION_ROLES.marketing`.
- Baja en dos tiempos (revisión 26-08): el GET solo confirma, porque los escáneres corporativos (Outlook SafeLinks) abren todos los links; el POST suprime. La firma HMAC es de empresa más correo, y `ca` va fuera de la firma para que los links viejos sigan valiendo. Evidencia: comentario "DOS TIEMPOS" en `MarketingController`; `BajasService.urlDeBaja`.
- El webhook exige firma en producción (fail-closed, revisión 26-08), rechaza avisos de más de 5 minutos y tiene un freno holgado de 1200 por minuto, porque un 429 botaría rebotes reales ("la barredora lo pilló"). Evidencia: `BajasService.verificarFirmaSvix`; `@Throttle` de `webhook`.
- Toda lectura sin tope conocido se pagina de a 1000, con orden estable (revisión 26-08: con más de 1000 bajas truncadas, se les volvería a escribir a quienes se dieron de baja). Evidencia: `MarketingRepository.todas` y `suprimidos`.
- El link de baja apunta al ambiente que lo genera (lección del 26-08: el del laboratorio llevaba a producción). Evidencia: `BajasService.baseApi` (`PUBLIC_API_URL`, luego `RAILWAY_PUBLIC_DOMAIN`).

## 7. Conexiones con otros módulos

**Quién usa piezas de Marketing**

| Módulo y mapa | Qué usa | Dónde |
|---|---|---|
| Embudo de consultas (`11_CONSULTAS_Y_FORMULARIOS_PUBLICOS.md`) | `plantillaCampana` SIN `bajaUrl` y SIN `cotizarUrl`, más `marcaDesdeFila`: el correo con brochures "valores para tu evento" (05-09) | `api-rest/src/consultas/consultas.service.ts`, `enviarBrochure` |
| Envío de cotizaciones (`02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md`) | `plantillaCampana` sin baja ni botón de cotizar, más `marcaDesdeFila`; `esClaro` y `textoSobre` para la franja de subtotales y la barra del total; el mismo secreto `MARKETING_BAJA_SECRET` (respaldo `RESEND_API_KEY`) firma el token de su puerta pública | `api-rest/src/quotations/envio-cotizacion.service.ts` (`secreto`), `api-rest/src/quotations/correo-cotizacion.ts` |
| Páginas públicas con marca (`17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md`) | `PieDeMarcaPublico` copia el pie del correo y tiene su propia "gemela" de `esClaro` | `frontend/src/components/PieDeMarcaPublico.tsx` |
| Respaldo (`19_DESPLIEGUE_Y_OPERACION.md`) | El cron de respaldo vuelca todas las tablas públicas, marketing incluido, sin lista a mano (`get_backup_tables()`) | `api-rest/src/backup/backup-cron.service.ts` |

**A quién usa Marketing**

| Módulo y mapa | Qué usa | Dónde |
|---|---|---|
| Clientes (`09_CLIENTES.md`) | Lee `clients` y `client_contacts` para resolver audiencias | `clientesSegmentables`, `contactosDeClientes`, `clientesPorTipo`, `tiposDeCliente` |
| Cotizador y negocio (`01_COTIZADOR.md`, `02_NEGOCIO_ENVIO_Y_SEGUIMIENTO.md`) | Lee `quotations` (estado, fecha y tipo de evento, total, creación). "Cotiza aquí" lleva al formulario público `/public-quotation/:company_id` | `cotizacionesSegmentables`, `tiposDeEvento`, `MarketingService.urlDeCotizar` |
| Empresa y acceso (`15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md`) | La marca de `companies` que se llena en Configuración, `CompaniesModule`, el rol administrador | `CompaniesRepository.findOne`, `marcaDesdeFila`, `CompanyConfiguration.tsx`, `ConfigurationPage.tsx` |
| Infraestructura del motor (`16_CALENDARIO_MOVIL_E_INFRAESTRUCTURA_DEL_MOTOR.md`) | `ScheduleModule` (crones solo en producción), `ThrottlerGuard`, `AuthGuard` y `RolesGuard`, `rawBody` para la firma del webhook, `validateEnv` (avisa si faltan `PUBLIC_API_URL`, `RESEND_WEBHOOK_SECRET` o `MARKETING_BAJA_SECRET`), `StorageService` para el banner propio | `app.module.ts`, `main.ts`, `config/validate-env.ts`, `storage/storage.service.ts` |
| Kit de la casa (`17_KIT_DE_LA_CASA_Y_BASE_DE_LA_APP.md`) | `MultiSelect` (con `buscador`), `Modal`, `ConfirmInline`, `toast`, `HoraInput`, `humanizeApiError`, `matchesSearch`, `formatISOUTCDateToString` | pantallas de `frontend/src/pages/marketing` |
| Correos internos (`12_CORREOS_INTERNOS_Y_NOTIFICACIONES.md`) | NO usa `EmailModule`: crea su propio `new Resend(RESEND_API_KEY)`. Comparte la cuenta de Resend y el dominio de envío | `MarketingService` |

**Efectos automáticos**

- Reloj cada minuto, solo en producción: despacha las programadas cuya hora llegó.
- Webhook de Resend: sellos de apertura, clic y rebote; supresión automática por rebote o queja.
- Baja pública: supresión con la campaña de origen.
- Copia del capitán a quien despacha o programó.
- Nada más: no notifica, no crea anotaciones de seguimiento, no toca clientes ni cotizaciones. Ninguna pantalla de otro módulo cambia por una campaña.
- A futuro, no construido: las consultas no convertidas como audiencia de remarketing (doc 12, punto 7).

## 8. Zonas de riesgo: si tocas esto, cuidado con aquello

1. **Si tocas** `plantillaCampana` (`api-rest/src/marketing/plantilla.ts`), **se afecta**, además de las campañas, el correo del embudo de consultas y el correo con PDF de "Enviar cotización", **porque** los tres importan la misma función. Ya pasó: el 10-09-2026 Outlook de escritorio mostraba franjas grises y botones aplastados en las respuestas, y hubo que rehacerla en tablas. Evidencia: `ConsultasService.enviarBrochure`, `EnvioCotizacionService`, commit f92be99, pruebas "la estructura va en TABLAS".
2. **Si tocas** los parámetros opcionales `bajaUrl` y `cotizarUrl` de `plantillaCampana` (volverlos obligatorios o darles valor por defecto), **se afectan** el correo del embudo y el de cotizaciones, que saldrían con link de baja y botón "Cotiza aquí", **porque** esos correos son respuestas a una solicitud, no campañas (comentario del 05-09). Ninguna prueba cubre la plantilla sin esos dos parámetros. Evidencia: firma de `plantillaCampana`; `audiencias-y-reenvio.spec.ts` siempre pasa los dos.
3. **Si tocas** la maqueta de la plantilla (volver a `<div>` con `max-width`, padding en un `<a>`, degradados), **se afecta** cómo se ve todo correo de marca en Outlook de escritorio, **porque** Outlook dibuja con el motor de Word, que ignora `max-width` y el fondo de un `<div>`. Evidencia: comentario "TODO EN TABLAS, POR OUTLOOK DE ESCRITORIO" en `plantillaCampana`.
4. **Si tocas** `marcaDesdeFila` (`api-rest/src/marketing/marca.ts`) o las columnas de marca de `companies`, **se afecta** la marca de la prueba, del envío manual, del reloj, del embudo y de las cotizaciones, **porque** cuatro llamadores arman la marca con esa función: `MarketingController.empresaDe`, `MarketingCronService`, `ConsultasService.enviarBrochure` y `EnvioCotizacionService`.
5. **Si tocas** `esClaro` o `textoSobre`, **se afectan** también la franja de subtotales y la barra del total del correo de cotización, **porque** `correo-cotizacion.ts` los importa. Y el pie de las páginas públicas NO cambia solo, **porque** `PieDeMarcaPublico` tiene su propia copia, con otro umbral. Evidencia: imports de `api-rest/src/quotations/correo-cotizacion.ts`; `frontend/src/components/PieDeMarcaPublico.tsx`.
6. **Si tocas** `BajasService.firmaDeBaja`, `BajasService.secreto` o el valor de `MARKETING_BAJA_SECRET`, **se afectan** los links de baja de todos los correos ya enviados (dejan de valer, y la baja es obligación legal) y el token de la puerta pública del envío de cotizaciones, **porque** la firma es un HMAC de `companyId|email` con ese secreto y `EnvioCotizacionService.secreto` usa el mismo. Sin esa variable, ambos dependen de `RESEND_API_KEY`. Evidencia: `api-rest/src/marketing/bajas.service.ts`, `api-rest/src/quotations/envio-cotizacion.service.ts`.
7. **Si tocas** `GET /marketing/baja` para que suprima de una, **se da de baja** gente que nunca lo pidió, **porque** los escáneres de seguridad corporativos abren todos los links de un correo (hallazgo de la revisión del 26-08). Evidencia: comentario "DOS TIEMPOS" en `MarketingController`.
8. **Si tocas** `rawBody: true` en `main.ts`, la variable `RESEND_WEBHOOK_SECRET` o `verificarFirmaSvix`, **se pierden** en silencio todos los resultados (aperturas, clics, rebotes) y la supresión automática de rebotes, **porque** la firma se calcula sobre el cuerpo crudo, producción rechaza si no hay secreto, y el rechazo responde `{ ok: false }` con código de éxito, así que Resend no reintenta. Evidencia: `MarketingController.webhook`, `BajasService.verificarFirmaSvix`.
9. **Si tocas** el orden de las rutas en el controller, **se rompen** renombrar y borrar importadas, **porque** `audiencias/importada` tiene que ir antes de `audiencias/:id`: si no, "importada" calza como id y el motor busca la audiencia NaN. Evidencia: comentarios "OJO CON EL ORDEN" y "ANTES de :id" en `MarketingController`.
10. **Si tocas** `MarketingRepository.todas` o agregas una lectura de listas sin paginar, **se cortan** audiencias, conteos y envíos y, lo más grave, la lista de supresión, **porque** Supabase corta en 1000 filas por consulta sin avisar: con más de 1000 bajas se les volvería a escribir a personas que se dieron de baja. Evidencia: comentarios de `todas` y `suprimidos` (barredora del 26-08).
11. **Si tocas** los estados de la campaña, **se afectan** el candado de edición y borrado, el reloj y los chips de la app, **porque** el CHECK de la base solo acepta `borrador`, `programada` y `enviada` (migración 103), "la programada no se edita" depende de `estado !== 'borrador'` en `editarCampana` y `borrarCampana`, y `enviarCampana` acepta `programada` para el "Enviar ahora". Evidencia: esas funciones; `CampanaFichaPage`; `Campanas` en `MarketingPage`.
12. **Si tocas** `MarketingCronService` o `tomarProgramada`, **se afecta** el despacho único de las programadas y **no lo vas a ver en el laboratorio**, **porque** los crones corren solo en producción (`cronJobs: process.env.NODE_ENV === 'production'`) y el único candado es el update condicionado a `estado = programada`. Evidencia: `app.module.ts`; doc 11, regla 4 del capítulo "Programar envío".
13. **Si tocas** `enviarCampana` (orden de pasos o lotes), **se afecta** la regla de una vez, **porque** el envío manual no tiene candado (solo el reloj lo tiene) y cada lote primero sale por Resend y después se registra. Dos envíos a la vez, o una caída entre esos dos pasos, pueden duplicar correos; y un duplicado hace fallar el insert contra `marketing_sends_una_vez`. Evidencia: `MarketingService.enviarCampana`; migración 91.
14. **Si tocas** las columnas espejo (`audiencia_tipo`, `audiencia_id`, `audiencia_ref`, `tipos_cliente`, `filtro`), **se afectan** el envío, la recomendación y la edición de campañas antiguas, además del historial y su buscador, **porque** las campañas anteriores al 27-08 tienen `audiencias` nulo y el motor y la app caen a esas columnas. Evidencia: `candidatosDe`, `audienciasDe`, `aperturasPorCampana`, `seleccionDeCampana`; migración 99.
15. **Si tocas** los nombres de `quotation_status` en el cotizador, **se rompe** sin aviso todo segmento con "Nos compró" o "No nos compró", aniversario o monto mínimo, **porque** `resolverSegmento` compara textos: el 26-08 se descubrió que 'anulada' no calzaba con ninguna fila. Evidencia: comentario de `con_estados` en `segmento.ts`.
16. **Si tocas** `client_contacts` o `clients` (`09_CLIENTES.md`), **cambia** a quién le llega cada campaña de la base, **porque** el segmento abre cada cliente a sus contactos con correo y usa `contact_person` y el `email` de la ficha como respaldo. Evidencia: `contactosDeClientes`, `clientesSegmentables`, `resolverSegmento`.
17. **Si tocas** `FRONTEND_URL`, la carpeta `frontend/public/correo` o la ruta `/public-quotation/:company_id`, **se afecta** cada correo de marca, incluso los ya enviados, **porque** los íconos se sirven en vivo desde el frontend y "Cotiza aquí" apunta a esa ruta. Evidencia: `MarketingService.baseFrontend` y `urlDeCotizar`; `iconosBase` en `plantillaCampana`.
18. **Si tocas** `personalizar` o `esc`, **se afectan** la seguridad y el aspecto del correo, **porque** el asunto va crudo y los sumideros HTML escapan una sola vez: escapar doble muestra `&amp;`, y no escapar permite meter HTML con el nombre de un contacto. Evidencia: comentarios en `plantilla.ts`; pruebas "los datos con comillas o < no rompen el HTML del correo" y "escapa el HTML ANTES de formatear".

## 9. Pruebas que lo protegen

**Motor** (Jest; el CI corre `npx jest` en `.github/workflows/ci.yml`):

| Archivo | Qué cubre |
|---|---|
| `api-rest/src/marketing/tests/resolver-destinatarios.spec.ts` | `resolverDestinatarios`: quita repetidos sin importar mayúsculas, respeta supresión y regla de una vez, descarta correos malformados. `personalizar` con respaldos |
| `api-rest/src/marketing/tests/segmento.spec.ts` | `resolverSegmento`: sin correo no hay campaña, aniversario de 11 a 13 meses, dormidos, monto mínimo, estados con rango de fechas, condiciones que se suman, expansión a personas, respaldo a la ficha, `cancelada` y el alias `anulada`, un correo cuenta una vez |
| `api-rest/src/marketing/tests/audiencias-y-reenvio.spec.ts` | `validarAsuntoDeReenvio`, `linkDeWhatsApp`, `urlAbsoluta`; `plantillaCampana` (encabezado, banner, botones, franja, íconos, tablas con `bgcolor`, ghost tables, `mso-padding-alt`, preencabezado); colores legibles y escape; filtro vacío = todos; formato WhatsApp de `cuerpoAHtml` |
| `api-rest/src/marketing/tests/programacion.spec.ts` | `publicoDeAudiencia`, `mejorVentana` en hora de Chile, `rotuloDeAudiencia` |
| `api-rest/src/config/validate-env.spec.ts` | Arranque: las tres variables de marketing forman parte del juego completo de variables que no genera advertencias |

**App** (Vitest; el CI corre `npm run test`):

| Archivo | Qué cubre |
|---|---|
| `frontend/src/pages/marketing/leerArchivoDeContactos.test.ts` | `filasALineas`: columnas por nombre en español, planilla sin encabezados, limpieza de comas, planilla sin columna de correos |

**Lo importante que NO está cubierto**

- `MarketingService` no tiene prueba: prueba obligatoria, transiciones de estado, copia del capitán, lotes y fallidos, tope de dos envíos, programar y cancelar, `recomendacionesDe` y `mismaAudiencia`.
- `BajasService` no tiene prueba: firma y validación de la baja, `verificarFirmaSvix` (fail-closed y antigüedad del aviso), `procesarEventoResend` y la supresión por rebote.
- `MarketingCronService` y el candado `tomarProgramada` no tienen prueba.
- `AudienciasService` (importar, renombrar con choque, conteos honestos) y la paginación de `MarketingRepository.todas` no tienen prueba.
- Nada verifica el orden de rutas del controller ni que las rutas exijan administrador.
- `plantillaCampana` sin `bajaUrl` ni `cotizarUrl`, que es justo como la usan el embudo y las cotizaciones.
- `marcaDesdeFila`.
- En la app: `audienciasDeCampana` (`unaAudiencia`, `seleccionDeCampana`) y todas las pantallas.

## 10. Deuda y rarezas conocidas

- **`MarketingPage.tsx` tiene 1279 líneas.** Pasa las 800 y cuenta para el techo de 27 archivos grandes del portero, pero no está congelado por nombre (la lista de 7 gigantes de `frontend/scripts/portero-kit-de-la-casa.sh` no lo incluye). Adentro viven `Audiencias`, `VerAudiencia`, `Campanas` y `NuevaCampana`. Termina con un comentario huérfano ("Fase 2: lo que pasó con una campaña enviada…") sin función debajo: ese componente se mudó a la ficha.
- `marketing.service.ts` (729 líneas) y `marketing.repository.ts` (664) se acercan a 800. Ya hubo dos extracciones "higuera" por la cerca de tamaño: `BajasService` (27-08) y `AudienciasService` (28-08); en la app, `EditorDeBorrador` (28-08).
- Duplicaciones:
  - la normalización de varias audiencias con columnas espejo está copiada en `crearCampana` y `editarCampana`;
  - `crearCampana` conserva el camino viejo de una sola audiencia, que la app ya no usa;
  - la inserción de `{nombre}` y `{empresa}` está copiada en `NuevaCampana` y `EditorDeBorrador`, y el editor no la ofrece en el preencabezado;
  - la marca por defecto está armada en `empresaDe` y, de otra forma, en el reloj;
  - `esClaro` de `PieDeMarcaPublico` usa un umbral distinto al del motor (motor: luminancia sobre 0,62, cerca de 158 de 255; app: sobre 200 de 255). Un color intermedio es "claro" en el correo y "oscuro" en la página pública.
- Código muerto o sin uso: `EnviarCampanaDto`; `GET /marketing/campanas/:id/resultados` y `resultadosDeCampana`; las columnas `boton_texto` y `boton_url` (migración 91) y `marketing_contacts.datos`; el tipo de audiencia `clientes` (`clientesPorTipo`), que la app ya no crea y que escribe al correo de la ficha en vez de a las personas.
- Lecturas sin paginar pese a la regla del propio repositorio: `aperturasPorCampana`, `tiposDeCliente`, `tiposDeEvento`, `bajasDe`, `audienciasGuardadas`, `campanas`, `programadasVencidas`. Las más expuestas son `tiposDeEvento` (lee todas las cotizaciones) y `aperturasPorCampana`.
- `opened_at` se sobreescribe con cada apertura o clic: guarda la última, no la primera, y la recomendación de horario se calcula con esas horas.
- La queja (`email.complained`) se guarda como `bounced_at` con motivo `rebote`, así que los indicadores la cuentan como rebote.
- Si un lote falla en Resend, queda completo como `fallido`, la campaña igual pasa a `enviada`, y esos correos no se pueden reintentar porque `enviosDe` no mira el estado.
- La copia del capitán cuenta en `total_destinatarios`, en los indicadores y en la recomendación, y recibe la segunda pasada si no abrió. En cambio, la confirmación "¿Enviar a N?" no la incluye.
- Mensajes que confunden: editar o borrar una programada responde "Una campaña enviada no se edita" o "no se borra". `tomarProgramada` no limpia `programada_por`.
- "El correo que salió" en la ficha no es una copia guardada: `htmlDe` lo vuelve a dibujar con la marca de hoy, y en campañas con segunda pasada muestra el asunto original.
- `enviarPrueba` no revisa el estado: se puede mandar la prueba de una campaña ya enviada.
- Cada banner propio se sube con nombre único al balde público `company-logos`, y nada los borra.
- La foto del esquema `docs/migrations/0_initial_models.sql` no incluye las tablas de marketing. `CLAUDE.md` no lista el módulo `marketing` y nombra un `frontend/databaseSchema/database_schema.sql` que no existe en esa ruta.
- Pendientes del doc 11: el subdominio de marketing en Resend (`MARKETING_FROM`) y el SPF duplicado en `send.eventi-app.com` que GoDaddy no deja borrar.
- No hay TODOs pendientes en el módulo: el "TODO EN TABLAS" de `plantilla.ts` es un título, no una tarea.

## 11. Contradicciones entre documento y código

1. **Webhook sin secreto.** Doc 11, Fase 2: firma verificada "cuando `RESEND_WEBHOOK_SECRET` está puesto; sin él procesa igual". Código: `BajasService.verificarFirmaSvix` RECHAZA en producción si falta el secreto ("FAIL-CLOSED en producción (revisión 26-08)"), y `validate-env.ts` lo anota: "sin él, producción RECHAZA los webhooks". Solo fuera de producción procesa sin verificar.
2. **La baja en un paso.** Doc 11, Fase 1: endpoint público firmado "que suprime y responde una página simple". Código: `MarketingController.bajaConfirmar` (GET) solo confirma y `bajaEjecutar` (POST) suprime; el cambio es de la revisión del 26-08, por los escáneres SafeLinks.
3. **Botón configurable.** Doc 11, Fase 1 ("botón opcional") y regla 6 (campos "título, cuerpo, botón"). Código: ni `CrearCampanaDto` ni `EditarCampanaDto` tienen botón; `plantillaCampana` pone siempre "Cotiza aquí" (`urlDeCotizar`) y WhatsApp si hay número; las columnas `boton_texto` y `boton_url` de la migración 91 no se leen ni se escriben.
4. **Mismo formato que `baseLayout.ts`.** Doc 11, "Formato de la casa": la plantilla usa "el MISMO azul, cabecera, botón y pie que `email/templates/baseLayout.ts`". Código: `plantillaCampana` usa la paleta de cada empresa (`colorPrimario` y `colorSecundario` de `companies.colors`, por defecto `#134686`), en tablas y sin degradados (la prueba exige `not.toContain('linear-gradient')`), mientras `api-rest/src/email/templates/baseLayout.ts` sigue con `linear-gradient(135deg, #134686 ...)`.
5. **Un solo selector de audiencia.** Doc 11, punto 2 de "Audiencias guardadas": la campaña elige UNA audiencia con "un solo selector (`SelectWithSearch` con grupos)". Código: `NuevaCampana` y `EditorDeBorrador` usan `MultiSelect` y aceptan varias (selección múltiple del 27-08, migración 99, `CrearCampanaDto.audiencias`); el doc no menciona la selección múltiple.
6. **"No nos compró" con 'anulada'.** Doc 11, punto 3: "No nos compró" = "rechazada+anulada". Código: `NO_ACEPTO = ['rechazada', 'cancelada']` en `SegmentoBuilder`; `segmento.ts` explica que 'anulada' no calzaba con ninguna fila y quedó solo como alias desde el 26-08.
7. **Contadores en la fila de la campaña.** Doc 11, Fase 2: contadores de aperturas, clics y rebotes "en la fila de la campaña". Código: la tabla `Campanas` de `MarketingPage` no los muestra (N°, fecha, campaña, audiencia, destinatarios, estado); los indicadores viven en la ficha (`detalleDe`), y `GET .../resultados` quedó sin uso.
8. **Constructor de segmentos completo.** Doc 11, Fase 3: condiciones de rango de fechas, aniversario, dormidos y presupuesto histórico, con previa también dentro de Nueva campaña ("Segmento de tu base"). Código: `SegmentoBuilder` expone solo tres filtros ("Felipe lo dejó en TRES filtros (25-08)") y `NuevaCampana` no arma segmentos; `resolverSegmento` y `FiltroSegmentoDto` todavía soportan el resto, sin pantalla. El propio doc supera la Fase 3 en su capítulo siguiente, pero no la corrige.
9. **`datos` de las importadas.** Doc 11, "Tablas": `marketing_contacts` con "datos jsonb para la satisfacción del Forms". Código: `ImportarContactosDto` solo trae email, name y empresa; `AudienciasService.importarContactos` no escribe `datos` y nadie lo lee.

## 12. Preguntas abiertas

- ¿Está creado el webhook en el panel de Resend y puesto `RESEND_WEBHOOK_SECRET` en Railway? El doc 11 lo deja "pendiente de Felipe"; sin eso, producción rechaza todos los avisos y los indicadores quedan en cero. No se puede confirmar desde el código.
- ¿Están definidas `PUBLIC_API_URL` y `MARKETING_BAJA_SECRET` en producción y en el laboratorio? Sin la segunda, la baja y el token de cotizaciones dependen de `RESEND_API_KEY`, y cambiar esa clave invalidaría los links de baja ya enviados.
- ¿Se configuró `MARKETING_FROM` (el remitente separado para cuidar la reputación)?
- ¿Se validó en producción un disparo real de campaña programada, como pide el capítulo "Programar envío"? El código no deja rastro de eso.
- ¿La queja debe contarse igual que un rebote en los indicadores?
- ¿Los fallidos de un lote deberían poder reintentarse?
- ¿Sirve que la recomendación de horario use la última apertura y no la primera?
- ¿Cuántas cotizaciones y aperturas hay por empresa? Si pasan de 1000, `tiposDeEvento` y `aperturasPorCampana` ya están cortando datos. No se consultó la base.
- ¿Quedan en producción campañas del tipo viejo `clientes` o con `audiencias` nulo? De eso depende si el camino viejo se puede enterrar.
- ¿Alguna vez se importaron datos del Forms a `marketing_contacts.datos`?
- ¿La hora de programar debe ser siempre la de Chile? Hoy es la del navegador de quien programa.

## 13. Archivos clave

**Motor**

- `api-rest/src/marketing/marketing.module.ts`: arma el módulo (importa `SupabaseModule` y `CompaniesModule`).
- `api-rest/src/marketing/marketing.controller.ts`: las 28 rutas, `empresaDe`, la página de baja.
- `api-rest/src/marketing/marketing.service.ts`: campañas, prueba, envío, reenvío, programación, recomendación.
- `api-rest/src/marketing/audiencias.service.ts`: estantería, importación, previa y resolución de segmentos.
- `api-rest/src/marketing/bajas.service.ts`: firma de baja, cabeceras `List-Unsubscribe`, webhook de Resend.
- `api-rest/src/marketing/marketing-cron.service.ts`: el reloj de las programadas.
- `api-rest/src/marketing/marketing.repository.ts`: única capa que toca las tablas; `todas`, `tomarProgramada`.
- `api-rest/src/marketing/dto/marketing.dto.ts`: DTOs.
- `api-rest/src/marketing/plantilla.ts`: `plantillaCampana`, `personalizar`, `cuerpoAHtml`, `resolverDestinatarios`, `validarAsuntoDeReenvio`, `esClaro`, `textoSobre`.
- `api-rest/src/marketing/marca.ts`: `marcaDesdeFila`.
- `api-rest/src/marketing/segmento.ts`: `resolverSegmento`.
- `api-rest/src/marketing/programacion.ts`: `publicoDeAudiencia`, `mejorVentana`, `RECOMENDACION_ESTUDIOS`.
- `api-rest/src/marketing/tests/`: `resolver-destinatarios.spec.ts`, `segmento.spec.ts`, `audiencias-y-reenvio.spec.ts`, `programacion.spec.ts`.
- Consumidores externos: `api-rest/src/consultas/consultas.service.ts`, `api-rest/src/quotations/envio-cotizacion.service.ts`, `api-rest/src/quotations/correo-cotizacion.ts`.
- Infraestructura que lo sostiene: `api-rest/src/main.ts` (`rawBody`), `api-rest/src/app.module.ts` (`MarketingModule`, `ScheduleModule`, `ThrottlerModule`), `api-rest/src/config/validate-env.ts`, `api-rest/src/storage/storage.service.ts` (`campaign-banner`).
- Migraciones: `docs/migrations/91_modulo_marketing.sql`, `92_marketing_fases_2_y_3.sql`, `93_audiencias_guardadas.sql`, `94_indices_upsert_marketing.sql`, `95_contacto_de_marca.sql`, `96_banner_de_correos.sql`, `97_empresa_en_envios.sql`, `98_baja-con-campana.sql`, `99_campana-multiaudiencia.sql`, `101_campana-banner-whatsapp.sql`, `103_campana-programada.sql`.
- Documento que manda: `docs/arquitectura/11_MODULO_DE_MARKETING.md`.

**App**

- `frontend/src/pages/marketing/MarketingPage.tsx`: pestañas Campañas y Audiencias.
- `frontend/src/pages/marketing/CampanaFichaPage.tsx`: ficha de la campaña.
- `frontend/src/pages/marketing/EditorDeBorrador.tsx`: edición del borrador.
- `frontend/src/pages/marketing/ProgramarEnvio.tsx`: `BotonProgramar` y `CajaProgramada`.
- `frontend/src/pages/marketing/SegmentoBuilder.tsx`: filtros y previa.
- `frontend/src/pages/marketing/CampanaMarcaPropia.tsx`: banner y WhatsApp propios.
- `frontend/src/pages/marketing/audienciasDeCampana.ts`: códigos de audiencia ida y vuelta.
- `frontend/src/pages/marketing/leerArchivoDeContactos.ts` y `leerArchivoDeContactos.test.ts`.
- `frontend/src/services/marketing.service.ts`: todas las llamadas al motor.
- `frontend/src/App.tsx` (rutas `marketing` y `marketing/campana/:id`), `frontend/src/constants/permissions.ts` (`marketing`), `frontend/src/constants/api.routes.ts` (`MARKETING`), `frontend/src/layout/Sidebar.tsx` (entrada del menú).
- `frontend/src/services/storage.service.ts` (`uploadCampaignBanner`).
- `frontend/public/correo/`: íconos que usan los correos (whatsapp, instagram, facebook, web).
- `frontend/src/components/PieDeMarcaPublico.tsx`: gemelo del pie del correo en páginas públicas.
