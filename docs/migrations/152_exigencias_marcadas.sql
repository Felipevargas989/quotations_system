-- 152: LAS EXIGENCIAS QUE MARCA LA EMPRESA (19-10-2026).
--
-- Felipe, revisando «Bases y criterios»: "debería ser como un listado de
-- exigencias, así como almuerzo, esto. Y marcar algunos que sean como lo
-- tengo y otro hay que conseguir o revisar. Y quizás con alguna función que
-- yo pueda ir haciendo un check... Y si marco uno que no puedo, bueno,
-- desisto con la postulación."
--
-- Por oportunidad, lo que la empresa marcó en cada exigencia de las bases:
--   {"<la exigencia, en minúsculas y sin tildes>": "lo_tengo" | "no_puedo"}
-- La clave es el texto de la exigencia, no su posición: si se vuelven a
-- analizar las bases, lo marcado sigue con su exigencia.
--
-- Número 152: del 146 al 149 los usa la otra conversación de Eventia.
-- Primero en el laboratorio (Cotizador); a producción, con el OK de Felipe.

alter table public.oportunidades
  add column if not exists exigencias_marcadas jsonb not null default '{}'::jsonb;

comment on column public.oportunidades.exigencias_marcadas is
  'Lo que la empresa marcó en cada exigencia de las bases: lo_tengo o no_puedo, por el texto de la exigencia (migración 152).';

-- Marcar en un solo paso (19-10, visto en el laboratorio): leer las marcas
-- y después guardarlas dejaba que dos marcas seguidas se pisaran (la
-- segunda guardaba sin la primera). La base suma o quita la marca en la
-- misma instrucción, con la fila bloqueada: ninguna se pierde. Devuelve
-- todas las marcas; null si la oportunidad no es de esa empresa. Una marca
-- que no sea lo_tengo ni no_puedo no cambia nada (el motor ya la rechaza).
create or replace function public.marcar_exigencia(
  p_company_id bigint,
  p_id bigint,
  p_clave text,
  p_marca text
) returns jsonb
language sql
set search_path = ''
as $$
  update public.oportunidades
     set exigencias_marcadas = case
           when p_marca is null then exigencias_marcadas - p_clave
           when p_marca in ('lo_tengo', 'no_puedo')
             then exigencias_marcadas || jsonb_build_object(p_clave, p_marca)
           else exigencias_marcadas
         end
   where company_id = p_company_id
     and id = p_id
  returning exigencias_marcadas;
$$;

revoke all on function public.marcar_exigencia(bigint, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.marcar_exigencia(bigint, bigint, text, text)
  to service_role;
