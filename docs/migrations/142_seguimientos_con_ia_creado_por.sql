-- ============================================================
-- 142 · SEGUIMIENTO CON IA: «QUIÉN LO PIDIÓ» SIN LLAVE FORÁNEA (18-10-2026)
-- ============================================================
-- La 141 creó `seguimientos_con_ia.creado_por` con una llave foránea a
-- `user_profiles(id)`. Pero el motor guarda ahí el id de la SESIÓN (el de
-- auth: `user.id`, el mismo que `quotation_followups.author_user_id`), que
-- en `user_profiles` es `user_id`, no `id`. Medido en producción el 18-10
-- antes de que pasara: el id de Camila está en auth.users y en
-- user_profiles.user_id, no en user_profiles.id. Con la llave, cada borrador
-- nuevo habría fallado al guardarse (el motor lo deja pasar con un aviso en
-- el registro) y su envío no se habría detectado.
--
-- Queda como `author_user_id` de la bitácora: un uuid sin llave (mapa 18,
-- «por id sin llave»). Aplicada en el laboratorio y en producción el
-- 18-10-2026 (00:40 Chile), con la tabla todavía vacía de borradores
-- nuevos. Sin reinicio del motor. Número reservado con la sesión de
-- Oportunidades. Idempotente.
-- ============================================================

alter table public.seguimientos_con_ia
  drop constraint if exists seguimientos_con_ia_creado_por_fkey;

-- ============================================================
-- REVERSA (solo si el motor pasa a guardar user_profiles.id):
--   alter table public.seguimientos_con_ia
--     add constraint seguimientos_con_ia_creado_por_fkey
--     foreign key (creado_por) references public.user_profiles(id)
--     on delete set null;
-- ============================================================
