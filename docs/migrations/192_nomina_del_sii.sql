-- 192 · LA NÓMINA DEL SII: EL RUT QUE LLENA TODO (doc 19 §9.25 y §9.27)
--
-- Felipe, 07-11-2026: "¿cómo lo podemos hacer para que al momento de
-- facturar, el sistema cargue todo solo con el RUT? ¿se podrá?" y, con el
-- plan, "me parece perfecto el orden, sumemos todo".
--
-- Las personas jurídicas con actividades vigentes de la nómina pública del
-- SII (https://www.sii.cl/sobre_el_sii/nominapersonasjuridicas.html:
-- PUB_NOMBRES_PJ, PUB_NOM_ACTECOS y PUB_NOM_DIRECCIONES, de agosto de
-- 2026): unas 1,7 millones de empresas, cerca de 300 MB. La carga la hace
-- el motor desde sii.cl («Cargar la nómina del SII», doc 19 §9.27): baja
-- los tres ZIP, junta por RUT y guarda una fila por empresa, ya cortada a
-- lo que cabe en la factura (giro 40, dirección 60, comuna y ciudad 20).
--
-- No es de ninguna empresa: son datos públicos. Por eso no lleva
-- `company_id`, y solo el motor la lee (con la llave de servicio). Queda
-- FUERA del respaldo diario (`FUERA_DEL_RESPALDO` en
-- `api-rest/src/backup/backup-cron.service.ts`): ese respaldo arma el
-- archivo entero en memoria, y la nómina se vuelve a bajar del SII.
--
-- OJO al aplicarla en producción: primero el motor que ya la deja fuera
-- del respaldo (o la tabla vacía hasta entonces). Y antes de cargarla, mirar
-- el disco (regla del 29-10-2026).

create table if not exists public.sii_cargas (
  id bigserial primary key,
  empezo_en timestamptz not null default now(),
  termino_en timestamptz,
  estado text not null default 'cargando'
    check (estado in ('cargando', 'lista', 'fallo')),
  -- Las empresas guardadas hasta ahora (avanza mientras carga).
  empresas integer not null default 0,
  error text,
  pedida_por uuid,
  pedida_por_nombre text
);

create table if not exists public.sii_contribuyentes (
  -- El RUT sin dígito verificador.
  rut integer primary key,
  dv char(1) not null,
  razon_social text not null,
  -- La primera actividad propuesta (las afectas a IVA primero y, entre
  -- ellas, la más antigua), cortada a 40 (lo que cabe).
  giro text,
  -- Los códigos de todas sus actividades vigentes, en ese orden: al
  -- facturar se elige otra (`sii_actividades` trae su descripción).
  actividades integer[] not null default '{}',
  -- El domicilio vigente más reciente de la casa matriz.
  direccion text,
  comuna text,
  ciudad text,
  carga_id bigint not null references public.sii_cargas(id)
);

create index if not exists idx_sii_contribuyentes_carga
  on public.sii_contribuyentes (carga_id);

-- El diccionario de actividades económicas del SII (unas setecientas).
create table if not exists public.sii_actividades (
  codigo integer primary key,
  descripcion text not null
);

alter table public.sii_cargas enable row level security;
alter table public.sii_contribuyentes enable row level security;
alter table public.sii_actividades enable row level security;
revoke all on public.sii_cargas from anon, authenticated;
revoke all on public.sii_contribuyentes from anon, authenticated;
revoke all on public.sii_actividades from anon, authenticated;
grant select, insert, update, delete on public.sii_cargas to service_role;
grant select, insert, update, delete on public.sii_contribuyentes to service_role;
grant select, insert, update, delete on public.sii_actividades to service_role;
grant usage, select on sequence public.sii_cargas_id_seq to service_role;
