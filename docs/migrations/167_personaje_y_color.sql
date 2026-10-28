-- 167 · EL PERSONAJE Y EL COLOR DE CADA UNO (Felipe, 27-10-2026)
--
-- "Me gustaría poder elegir personajes para cada perfil ... también poder
-- elegir un color personal para cada seguimiento." Cada usuario elige en
-- «Mi cuenta» un personaje de la galería 3D que trae la app (la opción
-- «tipo Netflix») y su color. En el Seguimiento cada nota muestra la
-- letra del autor en su color y el personaje al lado del nombre (la
-- opción B que eligió Felipe). NULL = no eligió: la nota se ve como hasta
-- hoy, con la letra en el color automático y sin personaje.
--
-- La lista de personajes vive en la app (frontend/src/utils/personajes.ts);
-- acá solo se guarda la clave. El color se guarda como #rrggbb.
alter table public.user_profiles
  add column if not exists personaje text
    check (personaje is null or personaje ~ '^[a-z0-9-]{1,40}$'),
  add column if not exists color text
    check (color is null or color ~ '^#[0-9a-f]{6}$');

comment on column public.user_profiles.personaje is
  'Clave del personaje que eligió el usuario en Mi cuenta (la lista vive en la app). NULL = sin personaje. Migración 167.';
comment on column public.user_profiles.color is
  'Color personal del usuario, #rrggbb: pinta su letra y sus notas del Seguimiento. NULL = color automático. Migración 167.';
