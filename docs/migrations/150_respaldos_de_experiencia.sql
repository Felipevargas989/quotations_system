-- 150: LOS RESPALDOS DE EXPERIENCIA (decisión 34 del doc 17, 19-10-2026).
--
-- Felipe, mientras bajaba las órdenes de compra de su experiencia: "quizás
-- debería existir el tipo de documento respaldo de experiencia, que puede
-- ser una factura o la orden de compra". Es un tipo más de la carpeta de la
-- empresa (oportunidades_documentos, migración 126: `tipo` es texto libre,
-- sin lista en la base), con sus datos para el anexo de experiencia:
--   {"numero": "4352-103-SE23", "mandante": "ILUSTRE MUNICIPALIDAD DE
--    QUILLON", "contrato": "...", "anio": 2023, "monto": 11782499,
--    "fuente": "mercado_publico" | "manual"}
-- El monto va en pesos, con impuestos (el total de la orden o la factura).
-- Con el número de una orden de compra, Eventia completa lo demás desde su
-- ficha pública de Mercado Público.
--
-- Número 150: del 146 al 149 los usa la otra conversación de Eventia.
-- Primero en el laboratorio (Cotizador); a producción, con el OK de Felipe.

alter table public.oportunidades_documentos
  add column if not exists datos jsonb;

comment on column public.oportunidades_documentos.datos is
  'Los datos de un respaldo de experiencia (decisión 34): número de orden o factura, mandante, contrato, año, monto con impuestos y de dónde salieron.';
