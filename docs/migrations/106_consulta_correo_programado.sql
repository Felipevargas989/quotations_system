-- 106 — El delay del embudo de consultas (Felipe, 05-09-2026:
-- "desde que entra a que sale podemos darle un delay de 10 min?").
-- La respuesta automática ya no sale al tiro: la consulta guarda la
-- hora citada (entrada + 10 min) y el reloj del motor la despacha.
-- NULL = nada pendiente (ya salió, o era repetida y no corresponde).
-- Sin backfill: las consultas históricas quedan en NULL, correcto.

ALTER TABLE consultas
  ADD COLUMN correo_programado_para timestamptz;
