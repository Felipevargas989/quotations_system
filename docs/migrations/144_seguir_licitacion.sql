-- 144: SEGUIR UNA LICITACIÓN (decisión 30 del doc 17, 19-10-2026).
--
-- Felipe: "quiero desarrollar una característica... hacer seguimiento de la
-- licitación", aunque no la postule (la gira de estudio: saber quién la
-- ganó para ofrecerle sus servicios). Dos cosas:
--
-- 1. Una oportunidad puede quedar 'seguida': el radar la revisa una vez al
--    día, de cualquier región y color, hasta que se adjudica, queda desierta
--    o se revoca.
-- 2. El acta pública de adjudicación de cada proceso: Mercado Público da su
--    enlace (UrlActa) y la página se abre sin código. Trae todas las ofertas
--    por ítem (proveedor, RUT, qué ofreció, a qué precio y si ganó). Es dato
--    público, así que va en mp_procesos, como el resto de lo de Mercado
--    Público.
--
-- Se aplica primero en el laboratorio (Cotizador); a producción, con el OK
-- de Felipe.

alter table public.oportunidades
  drop constraint if exists oportunidades_estado_check;
alter table public.oportunidades
  add constraint oportunidades_estado_check
  check (estado in ('nueva', 'en_estudio', 'postulada', 'ganada', 'perdida', 'descartada', 'seguida'));

alter table public.mp_procesos add column if not exists acta jsonb;
alter table public.mp_procesos add column if not exists acta_leida_en timestamptz;

comment on column public.mp_procesos.acta is
  'El acta pública de adjudicación leída (decisión 30): fecha, montos y cada ítem con todas sus ofertas.';
