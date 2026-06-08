ALTER TABLE public.service_groups
ADD CONSTRAINT service_groups_company_id_name_unique
UNIQUE (company_id, name);
