-- ============================================================
-- 128 · El comentario interno de la cotización (17-10-2026)
--
-- Felipe, 17-10: "cada requerimiento debería tener dos campos de
-- comentario, uno que lo ve el cliente y otro interno. En el interno
-- nosotros podemos poner como las instrucciones de (…) menú económico,
-- tres días, con desayuno, sin desayuno".
--
-- Observaciones (`observations`) sigue siendo el comentario que ve el
-- cliente: sale impreso en el PDF. Este es el otro, y NUNCA sale al
-- cliente: ni en el PDF, ni en el correo, ni en el portal, ni en la
-- encuesta. Lo leen el equipo, la skill armar-cotizacion y, más
-- adelante, el botón «Generar cotización» (doc 16, sección 6). La puerta
-- pública GET /quotations/:id lo quita cuando quien pregunta no es de la
-- empresa (mapa 01, zona de riesgo 8).
--
-- Columna nueva y vacía: no hace falta relleno. Se aplica primero en el
-- laboratorio y después en producción. Idempotente.
--
-- Número: la 122 a la 127 son de Oportunidades (rama
-- feature/oportunidades-radar y laboratorio).
-- ============================================================

alter table public.quotations
  add column if not exists comentario_interno text;

comment on column public.quotations.comentario_interno is
  'Notas internas del equipo e instrucciones para armar la cotización. Nunca sale al cliente (PDF, correo, portal, encuesta).';

-- ============================================================
-- REVERSA (se pierde lo escrito en los comentarios internos):
--   alter table public.quotations drop column if exists comentario_interno;
-- ============================================================
