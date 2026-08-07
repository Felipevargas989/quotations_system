-- Migración 63 — ESTADO DE LA COSECHA (07-08-2026, diseño de Felipe:
-- «podríamos dejar la regla simple que teníamos al principio, y yo poder
-- editar y colocar si ya está revendido; entonces deberíamos dejar
-- estados en una lista desplegable, y tú sugerir bajo nuestras 3
-- primeras reglas» —empresa + mandante + tipo de evento—).
--
-- Reemplaza el intento anterior de adivinar con reglas de distancia
-- entre fechas. Se probó y se rompía sola: FEPASA parte UN evento en dos
-- cotizaciones (adultos y niños) y la regla las leía como una
-- re-cotización; la Iglesia Adventista re-cotizó al día siguiente y la
-- regla lo leía como un regreso. Ninguna regla iba a ganarle al ojo de
-- quien vende.
--
-- Ahora la máquina SUGIERE con el cruce de siempre —cliente + mandante +
-- tipo de evento— y esta columna guarda la palabra final de Felipe.
-- NULL = sin corrección: manda la sugerencia.
--
-- Los cinco estados. Dos los puede sugerir la máquina (revendido /
-- no_ha_vuelto); los otros tres solo los sabe quien vende:
--   revendido    ✓ volvió a pedir lo mismo
--   en_gestion   ☎ ya lo llamé, lo estoy trabajando
--   no_ha_vuelto ⚠ pendiente de llamado
--   no_se_repite ⊘ evento único por naturaleza (matrimonio, graduación):
--                  no es un cliente perdido, simplemente no vuelve
--   descartado   ✕ no insistir (cerró, se fue el contacto, no va a volver)
-- 100 % aditiva.
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS harvest_status text;

COMMENT ON COLUMN public.quotations.harvest_status IS
  'Estado de la cosecha del mes, puesto a mano: revendido | en_gestion | no_ha_vuelto | no_se_repite | descartado. NULL = manda la sugerencia automática (cliente+mandante+tipo de evento).';
