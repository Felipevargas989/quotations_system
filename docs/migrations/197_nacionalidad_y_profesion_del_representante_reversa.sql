-- 197 (reversa): saca las dos columnas. Antes, el motor tiene que volver a
-- la versión que no las pide al leer «Mi empresa».

alter table public.oportunidades_oferente
  drop column if exists representante_nacionalidad,
  drop column if exists representante_profesion;
