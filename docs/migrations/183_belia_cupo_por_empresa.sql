-- 183 · El cupo de BelIA de cada empresa (doc 20 §7 y §16).
--
-- Felipe, 04-11-2026: "Belia es para todos los usuarios de Eventia, solo que
-- en las otras empresas que se vayan creando, dale $10 de cupo inicial, nada
-- más."
--
-- Lo que BelIA puede gastar al mes por empresa, en US$ (la cuenta es la de
-- `asistente_uso`, migración 180). Las empresas parten con 10; Valle del Sol
-- (la empresa 1) sigue con los 100 del 03-11. Se cambia acá, a mano, por
-- empresa. Si el motor no puede leer la columna, usa los 100 de siempre: por
-- eso esta migración va ANTES del motor.

alter table public.companies
  add column if not exists tope_asistente_usd numeric(10, 2) not null default 10
  check (tope_asistente_usd >= 0);

update public.companies set tope_asistente_usd = 100 where id = 1;
