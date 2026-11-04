-- ============================================================
-- 184b · SOLO EN EL LABORATORIO: los datos de facturación a
-- `razones_sociales` (04-11-2026)
-- ============================================================
-- NO SE CORRE EN PRODUCCIÓN: allá nunca existieron estas columnas.
--
-- La primera versión de la 184, aplicada solo en el laboratorio el 04-11,
-- guardaba un juego de datos de facturación en columnas de `clients`. Ese
-- mismo día Felipe pidió varios RUT por cliente (doc 19 §9.12) y la 184 se
-- rehízo con `razones_sociales`. Esto muda lo que alcanzó a guardarse en el
-- laboratorio (los datos de prueba de CCU) y después quita esas columnas:
-- nada se pierde. Se corre DESPUÉS de la 184 nueva. Idempotente.
-- ============================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'clients'
       and column_name = 'rut'
  ) then
    insert into public.razones_sociales
      (company_id, client_id, rut, razon_social, giro, direccion, comuna,
       ciudad, correo_facturacion, referencias_exigidas)
    select company_id, id, rut, coalesce(nullif(razon_social, ''), name),
           giro, direccion_facturacion, comuna, ciudad, correo_facturacion,
           referencias_exigidas
      from public.clients
     where rut is not null
    on conflict (client_id, rut) do nothing;

    alter table public.clients drop constraint if exists clients_rut_chk;
    alter table public.clients
      drop column if exists referencias_exigidas,
      drop column if exists correo_facturacion,
      drop column if exists ciudad,
      drop column if exists comuna,
      drop column if exists direccion_facturacion,
      drop column if exists giro,
      drop column if exists razon_social,
      drop column if exists rut;
  end if;
end $$;
