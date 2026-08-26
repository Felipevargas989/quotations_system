-- 97 · La empresa viaja con cada envio (26-08-2026, revision [high])
-- Ver docs/arquitectura/11_MODULO_DE_MARKETING.md
--
-- Hallazgo de la revision: al expandir las audiencias a PERSONAS,
-- marketing_sends solo guardaba email+name (la persona), y la segunda
-- pasada rellenaba {empresa} con el nombre de la persona ("en Sandra
-- Saez tenemos..."). La empresa se congela aqui al enviar.

ALTER TABLE public.marketing_sends
  ADD COLUMN IF NOT EXISTS empresa text;

-- Reafirmacion de permisos (la leccion del 91): inofensivo si ya estan.
GRANT ALL ON TABLE public.marketing_sends TO service_role;
