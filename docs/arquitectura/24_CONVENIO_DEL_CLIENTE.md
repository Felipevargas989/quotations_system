# 24 — El convenio del cliente y sus documentos

> Estado: **en el laboratorio** desde el 19-11-2026 (rama
> `feature/convenio-del-cliente`, migración 211 solo en «Cotizador»). A
> producción, solo con el «a producción» de Felipe. Mapa: `mapa/09_CLIENTES.md`
> (flujo H, zona 18).

## 1. Qué pidió Felipe

Sus palabras: *"tengo muchos convenios con clientes dando vuelta"*; *"cómo
podemos darle una funcionalidad a Eventia a los clientes con convenio"*; *"el
contrato puede estar como anexado… así como están los documentos en la
cotización, pero hay documentos que son como del cliente. Y este contrato, en
el caso de que tenga el convenio, ya está el contrato firmado y si no, poder
enviarlo por internet para que lo firmen"*.

Entre «aceptar en línea» y «subir PDF firmado» eligió **aceptar en línea**.
Vio la maqueta de tres pantallas (las dos tarjetas de la ficha y la página
pública) y la aprobó.

## 2. Lo decidido

| # | Decisión | Quién |
|---|---|---|
| 1 | Dos tarjetas blancas en la ficha del cliente, con título en pestaña de color (`TituloDeSeccion`): «Convenio» (verde) y «Documentos del cliente» (azul). Solo en clientes que NO son particulares | Felipe, maqueta |
| 2 | Chip de UNA palabra y el detalle en una línea chica: «Sin convenio» (neutro; «Convenio simple · gratis con la firma»), «Enviado» (ámbar; «A correo · fecha»), «Firmado» (verde; «firmante · fecha · vence fecha», vence = firma + vigencia) | Felipe, maqueta |
| 3 | «Enviar convenio» va a la persona principal y antes de enviar se puede elegir otra; en «Enviado» dice «Reenviar convenio». «Subir firmado» (PDF + fecha + firmante opcional) para los firmados en papel. «Ver convenio» cuando está firmado | Felipe, maqueta |
| 4 | La plantilla y sus beneficios **cuelgan de la empresa** (`convenio_plantillas`); una empresa sin plantilla no ve «Convenio», sí «Documentos del cliente». Nada de Valle del Sol escrito en el código | Gerente, 19-11 |
| 5 | El texto del contrato va **tal cual** en una plantilla editable; solo los huecos `[*]` pasan a `{{variables}}` y la fecha fija del formato a `{{fecha_firma}}` (la real) | Gerente, 19-11 |
| 6 | Personería del cliente: tres campos opcionales; vacíos quedan como línea en blanco en el PDF | Gerente, 19-11 |
| 7 | El correo de la empresa en la cláusula OCTAVO sale de `convenio_plantillas.correo_de_contacto` (Valle del Sol: contacto@valledelsolquillon.cl) | Gerente, 19-11 |
| 8 | «representada por su [*]» se llena con «{cargo}, don(a) {nombre}» | Gerente, 19-11 |
| 9 | El enlace se guarda solo como huella (sha256); reenviar pone otro y el anterior deja de servir | Gerente, 19-11 |
| 10 | Editor de la plantilla en pantalla: fuera de esta versión (se edita por SQL) | Gerente, 19-11 |
| 11 | Tablas cerradas desde la migración (RLS sin políticas, nada para `anon`/`authenticated`, permisos a `service_role` tabla por tabla) y «uno vigente por cliente» con índice único parcial | Gerente, 19-11 |
| 12 | La página pública no entrega del cliente nada más que la razón social; enlace malo y enlace ajeno dan la misma respuesta | Gerente, 19-11 |
| 13 | Fechas y hora de la constancia en hora de Chile, dd-mm-aaaa | Gerente, 19-11 |
| 14 | Si la firma queda y el PDF falla: «Firmado · PDF pendiente» y «Generar PDF»; nunca un «Firmado» sin documento y sin aviso | Gerente, 19-11 |
| 15 | Aceptar dos veces seguidas no crea dos firmas ni dos PDF | Gerente, 19-11 |
| 16 | Quién puede: ver, quien ve la ficha 360 (sección Clientes); enviar, subir y borrar, desde vendedor. Sin permiso nuevo: son los mismos cargos de esa sección | Gerente, 19-11 |

## 3. Cómo funciona

1. **Enviar.** `POST /clients/:id/convenio/enviar` con la persona. El motor
   arma un enlace de 32 bytes al azar (`/convenio/<token>`), manda el correo
   con la marca de la empresa (copia oculta al «Responder a», como el doc 13)
   y, **solo si el correo salió**, guarda el convenio «enviado» con la huella
   del enlace.
2. **Abrir el enlace.** `GET /convenio-publico/:token` (20 por minuto por IP):
   nombre, logo y color de la empresa dueña, título, beneficios, vigencia, la
   razón social del cliente (la primera de sus razones sociales o, si no
   tiene, su nombre) y el texto con los huecos a la vista.
3. **Aceptar.** `POST /convenio-publico/:token/aceptar` (5 por minuto por
   IP). Se validan los RUT (`RutChileno`), el correo y la casilla. La firma
   se escribe con «solo si sigue enviado» (y un candado en memoria por
   convenio): de dos pestañas, una firma y la otra recibe «Este convenio ya
   fue firmado el dd-mm-aaaa». Se guarda quién aceptó (nombre, RUT, cargo,
   correo), los datos de la empresa, la fecha y hora, la IP, el navegador, el
   texto ya lleno y su huella sha256.
4. **El PDF.** El mismo navegador invisible del doc 13 (`puppeteer-core` +
   `@sparticuz/chromium`), pero con la hoja armada en el motor
   (`page.setContent`, sin red ni JavaScript): el contrato no es una hoja del
   frontend. Última página: «Constancia de aceptación en línea». Va al balde
   privado (`c<empresa>/client-documents/<cliente>/…`) y a `client_documents`
   con categoría `convenio`.
5. **Los correos.** Copia al firmante con el PDF; aviso al «Responder a» de
   la empresa con el enlace a la ficha. Si fallan, la firma ya quedó (se
   anota en el registro).
6. **Firmado en papel.** `POST /clients/:id/convenio/firmado-en-papel`: el PDF
   (subido antes por la puerta única, kind `client-document`), la fecha (no
   futura) y el firmante opcional.

## 4. La plantilla

`convenio_plantillas.texto`, con una marca mínima: línea en blanco entre
párrafos; `# ` título del documento; `## ` título de cláusula; `- ` viñeta;
un párrafo que empieza con `___` es un bloque de firma (los seguidos van lado
a lado). Variables: `razon_social`, `rut_empresa`, `representante_nombre`,
`representante_rut`, `representante_cargo`, `domicilio`, `comuna`, `region`,
`correo_empresa`, `fecha_firma`, `correo_de_contacto`,
`personeria_documento`, `personeria_fecha`, `personeria_notario`. La de Valle
del Sol se sembró en la 211 y se comprobó palabra por palabra contra el PDF
«CONVENIO SIMPLE VALLE DEL SOL - FORMATO BASE»: las únicas diferencias son los
huecos y la fecha.

## 5. El texto del contrato: lo corregido y lo pendiente

Corregido por Felipe el 19-11-2026 («Sí, corrígelos»), en la semilla de la 211
y en la plantilla del laboratorio (bloque 5 de la 211, idempotente):

| Antes | Después |
|---|---|
| «DÉCIMO. RESOLUCIÓN DE CONFLICTOS» (saltaba de OCTAVO a DÉCIMO) | «NOVENO. RESOLUCIÓN DE CONFLICTOS» |
| «En Santiago, República de Chile, a …» | «En Quillón, República de Chile, a …» |
| TERCERO III: «servicios prestados por la Empresa» | «servicios prestados por la Prestadora» |

La fecha fija del formato (10 de junio de 2024) ya se cambió por la fecha real
de la firma.

**Pendiente de Felipe:** el domicilio y los tribunales de NOVENO («las partes
fijan su domicilio en la comuna de Santiago, Región Metropolitana y se someten
a la jurisdicción de sus tribunales de justicia»). Cuando diga la comuna, es un
UPDATE de una frase:

```sql
update public.convenio_plantillas
set texto = replace(texto,
  'comuna de Santiago, Región Metropolitana',
  'comuna de <COMUNA>, Región de <REGIÓN>'),
  actualizado_en = now()
where company_id = 1;
```

Lo ya firmado no cambia: cada convenio guarda su texto lleno con su huella (el
convenio de prueba del laboratorio sigue con el texto anterior, como evidencia).

## 6. Fuera de alcance de esta versión

El aviso del 30 % en el cotizador, los descuentos en recepción o caja, cargar
los convenios ya firmados de «Estatus Convenios», un editor de la plantilla en
pantalla y tocar `QuotationForm`.
