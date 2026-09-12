# Mapa: Aislamiento entre empresas

> **Estado: verificado una vez contra el código** (commit bd6a0e1, 11-09-2026), con la medición de producción del mismo día. Parte del atlas de docs/arquitectura/mapa; el índice es 00_MAPA_DEL_SISTEMA.md.

## 1. Qué es esto

Eventia es un sistema para varias empresas sobre una sola base. El motor entra
a Supabase con la llave de servicio, que se salta la seguridad de fila, así que
**la separación entre empresas vive solo en el código**: cada consulta tiene que
filtrar por `company_id`, y cada id que llega desde afuera tiene que verificarse
contra la empresa de la sesión.

Producción tiene 3 empresas con datos, así que esto dejó de ser teórico.

Este capítulo es el inventario de las puertas por donde hoy una empresa puede
leer, cambiar o borrar datos de otra, y el plan para cerrarlas.

## 2. Cómo se levantó

El 11-09-2026, sobre el commit `bd6a0e1`, con un análisis de 12 agentes: cinco
grupos de módulos rastreados y refutados por un segundo revisor escéptico, más
un barrido de "llaves ajenas", que son los id de otra empresa que llegan en el
cuerpo de una petición. Partió de un barrido estático de 81 métodos que tocan
Supabase sin filtro de empresa visible.

| Resultado | Cantidad |
| --- | --- |
| Puertas confirmadas | 31 |
| De exposición alta | 20 |
| De exposición media | 5 |
| De exposición baja | 6 |
| Métodos revisados y sanos | 65 |
| Hallazgos descartados por el revisor | 5 |

El detalle con citas de código vive fuera del repositorio, en
`Eventia_Desarrollo/atlas_pendiente/puertas_entre_empresas_hallazgos.json`.

## 3. Las dos causas

1. **Ids correlativos sin filtro de empresa.** En producción, `quotations`,
   `payments`, `user_profiles` y `clients` usan UUID aleatorio, pero todo el
   resto usa números correlativos: catálogo, menús, paquetes, abonos, empresas,
   personas, insumos. Donde el código no pregunta de qué empresa es el número,
   basta recorrerlos.
2. **Filtros que no filtran.** `.eq('quotations.company_id', x)` sobre una tabla
   embebida **sin** `!inner` no acota las filas padre: PostgREST usa left join
   por defecto y solo deja en nulo el objeto anidado. El código cree que filtra.
   Confirmado en la guía de Supabase *Querying Joins and Nested tables*.

## 4. El plan, por sprints

### Sprint 1 · Cerrar el catálogo con llave · HECHO EN EL LABORATORIO

Commit `8266ba1` en la rama `pruebas`, con 16 pruebas nuevas: 4 en el catálogo, 4 en paquetes, 4 en logística y 4 sumadas al archivo de menús guardados, que quedó en 7. El motor entero corre 379 pruebas en 64 archivos. **Todavía no está
en producción**: espera la validación de Felipe y su "a producción".

| Puerta | Qué permitía | Qué se hizo |
| --- | --- | --- |
| `PATCH /services/fixed/:id` | Un administrador de otra empresa editaba un servicio fijo ajeno por su número | El controller recibe al usuario; el update filtra por empresa; sin fila tocada, 404 |
| `PATCH /services/variable/:id` y `/categories` | Lo mismo con variables, y desvincular o crear categorías ajenas | Empresa en `updateVariableService`, `getLinksForService` y `deleteServiceCategoryLink`; el ajeno no llega al reordenamiento |
| `DELETE /service-groups/:id` | Cualquier vendedor de otra empresa borraba un menú guardado ajeno | Filtro de empresa y 404, igual que `renameGroup` |
| `DELETE /service-group-collections/:id` | Lo mismo con paquetes | Filtro de empresa y 404 |
| `POST /service-groups` y `POST /service-group-collections` | Armar un menú o paquete propio apuntando al catálogo ajeno | Se exige que cada id referenciado sea de la empresa |
| `POST /logistics/recipes` y `/logistics/fixed-cost-items` | Colgar recetas y costos propios de piezas ajenas | Misma verificación para servicio, insumo, mobiliario y recurso |

### Sprint 2 · Los filtros que no filtran · PENDIENTE

- `GET /customer-satisfaction-survey/answers`: cualquier sesión lee las
  respuestas de encuesta de todas las empresas. Falta `quotations!inner`.
- `GET /refunds`: lo mismo con los reembolsos.
- `GET /payments` y `POST /payments/transactions/overflow`: con el UUID de una
  cotización ajena se leen sus cuotas y se registran abonos reales.
- `DELETE /payments/:id`: borra una cuota con sus abonos sin mirar empresa.
  Ninguna pantalla usa esa ruta.
- `DELETE` y `PATCH /payments/transactions/:id`: el borrado se ejecuta antes de
  cualquier comprobación.
- `POST /customer-satisfaction-survey/template`: toma la empresa del query
  string, así que un administrador de otra empresa sobrescribe el cuestionario
  ajeno. Debe salir de la sesión.

### Sprint 3 · La cotización ajena · PENDIENTE

- `PATCH /quotations/:id` no compara empresa: con el UUID de una cotización
  ajena aceptada, la cascada de dinero mueve cuotas, plan y reembolsos antes de
  que la escritura final quede bloqueada. El arreglo es comparar `company_id`
  después del `findOne`, como ya hacen `markEventDone` y `setHarvestStatus`.
- Defensa en profundidad: `deletePaymentsByQuotationId` recibe la empresa y no
  la usa; `updatePayment` no filtra.
- `POST /quotations` acepta un `client_id` ajeno y `POST /client-contacts` un
  contacto colgado de un cliente ajeno.
- Logística: `assertEventosEditables` revisa si el evento está cerrado antes de
  comprobar que sea de la empresa.
- Móvil: el upsert del checklist de cocina usa la llave `(quotation_id, clave)`
  sin la empresa y pisa `company_id` y `marcado_por`. Necesita migración.

### Sprint 4 · Fichas de empresa y de usuarios · PENDIENTE

- `GET /companies/:id` devuelve la ficha completa de cualquier empresa, con sus
  datos de cobro, y los id de empresa son correlativos. El arreglo va en esa
  ruta privada, sin tocar `CompaniesRepository.findOne`, del que dependen los
  correos y la ruta pública.
- `GET` y `PATCH /users/:id` no filtran por empresa. Ojo: `AuthGuard` usa el
  mismo `findOne` sin empresa para poblar la sesión.

### Sprint 5 · Puertas públicas · PENDIENTE, toca el frontend

- `GET /quotations/:id` es público y devuelve la fila completa, con
  `provisioned_cost` y `provisioned_services`. Opciones: reusar la lista blanca
  de la hoja pública, o un token firmado como el de impresión. La encuesta
  pública depende de esta ruta.
- La respuesta de encuesta pública no exige token: con el UUID se puede
  responder por el cliente.
- `GET /event-types/public/:companyId` y sus tres puertas hermanas no revisan
  `companies.is_active`.

## 5. Aparte, no cruza empresas

Recepción puede borrar o enviar por correo una cotización formal de su propia
empresa por API directa: el candado de rol solo vive en la pantalla.

## 6. Si tocas esto

- **Si agregas un método de repositorio**, recibe `companyId` y filtra por
  `company_id`, o verifica la pertenencia por el padre con `!inner`. Es la regla
  de `CLAUDE.md` y es la única barrera que existe.
- **Si filtras por una tabla embebida**, usa `!inner` o no estás filtrando nada.
- **Si una ruta recibe un id en el cuerpo**, verifica que esa fila sea de la
  empresa antes de escribir.
- **Si cierras una de estas puertas**, actualiza este capítulo y el mapa del
  módulo en el mismo commit, y corre `graphify affected "NombreDeLaPieza"`.

Ver también 20_CONEXIONES_Y_ZONAS_DE_RIESGO.md, sección "Medición en producción
del 11-09-2026", y 05_CATALOGO_DE_SERVICIOS.md, 03_PAGOS_REEMBOLSOS_Y_PORTAL.md
y 15_ACCESO_EMPRESA_USUARIOS_Y_PLANES.md.
