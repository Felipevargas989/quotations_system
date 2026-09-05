# 12 · Módulo de Consultas (el embudo)

Acordado con Felipe el 05-09-2026 ("el A está ok... partiría con el
módulo A"). El caso de negocio, en sus palabras: las cotizaciones de
matrimonio, paseo de curso y graduación "entran por cientos, enviamos
la cotización tipo y solo algunos contestan" — y cada curioso quedaba
como cotización, saturando la lista.

**La regla: separar la CONSULTA (cientos, costo cero) de la COTIZACIÓN
(decenas, la atención de verdad).** Es un embudo con filtro.

## Cómo funciona

1. **Los tipos de evento son ADMINISTRABLES y cada uno declara su
   ENTRADA** (segunda vuelta de Felipe, 05-09: "ahí mismo se puede
   marcar como cotización o consulta como una categoría, agregar o
   eliminar"): tabla `event_types` por empresa (migración 105), con
   categoría explícita 'cotizacion' o 'consulta'. El administrador
   vive en la página Consultas → pestaña "Tipos de evento" — el
   catálogo junto a su pantalla, igual que los tipos de cliente viven
   en Clientes. OJO: tipo de CLIENTE (quién compra) y tipo de EVENTO
   (qué celebran) son ejes separados; el embudo decide SOLO por el
   tipo de evento. Se elimina solo un tipo sin uso (ni cotizaciones ni
   consultas); renombrar NO existe en v1 (el histórico guarda el
   texto). El cotizador y el formulario público leen el catálogo vivo
   (con endpoint público, como los tipos de cliente); el enum del
   código queda solo como respaldo si el catálogo no responde. Un tipo
   marcado 'consulta' SIN brochure manda el correo solo con texto — la
   pantalla lo advierte en ámbar.
2. **La puerta bifurca**: cuando el formulario público llega con un
   tipo en embudo, NO se crea cliente ni cotización — se crea una
   CONSULTA (registro liviano: nombre, correo, teléfono, tipo, fecha
   tentativa, personas, observaciones).
3. **Respuesta automática al tiro** por Resend con la marca de la
   empresa (brandEmailTemplate, la misma de los correos al cliente),
   replyTo a la casilla de la empresa, y los brochures adjuntos (1 o 2
   PDF por tipo, subidos por Felipe; viven en el bucket privado).
   Texto por tipo editable, con {nombre}; hay uno por defecto escrito
   con las reglas de la casa (cálido, habla del día y del complejo,
   invita a responder — skill de correos de Valle del Sol).
4. **Regla de una vez**: el mismo correo consultando el mismo tipo
   dentro de 14 días queda registrado pero NO recibe el brochure de
   nuevo (correo_enviado = false, visible en la lista).
5. **La hoja de Consultas** (pantalla): lista con estados —
   *respondida* (brochure enviado), *convertida*, *descartada* — con
   búsqueda, y la configuración de brochures/texto por tipo.
6. **Convertir es un clic humano** (decisión explícita: NO se lee el
   buzón para detectar respuestas — frágil y fuera de alcance). Camila
   ve la respuesta en Outlook → "Convertir en cotización": el motor
   matchea o crea el CLIENTE (la misma lógica anti-duplicados del
   formulario público) y la pantalla abre el cotizador con el cliente
   y los datos precargados; de ahí, flujo normal (de cero o con
   paquete). La consulta queda 'convertida' con su client_id.
7. **A futuro** (no construido): consultas no convertidas como
   audiencia de remarketing del módulo de Marketing.

## Tablas (migración 104)

- `consultas`: el registro (company_id, datos del interesado,
  event_type, estado, correo_enviado, client_id al convertir).
- `consulta_config`: por (company_id, event_type) — el texto del
  correo (null = el de la casa) y los brochures como jsonb
  [{nombre, path, bytes}] (máx. 2, en el bucket privado, kind
  'consulta-brochure').

## Lo que a propósito NO hace

- No crea clientes al consultar (el CRM no se ensucia con curiosos).
- No lee el buzón de correo.
- No manda el brochure dos veces en 14 días.
- No aparece en analytics ni en el pipeline: vive aparte.
