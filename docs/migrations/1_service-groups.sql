-- Feature: reusable service groups for the quotation form.
-- A group = 1 category + N variable_services, each with its own quantity.
-- Run this in the Supabase SQL editor.

-- The group header (name + category, scoped per company)
CREATE TABLE public.service_groups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id),
  name varchar NOT NULL,
  category varchar NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The N items of a group, each referencing a live variable_services row
CREATE TABLE public.service_group_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id bigint NOT NULL REFERENCES public.service_groups(id) ON DELETE CASCADE,
  variable_service_id bigint NOT NULL REFERENCES public.variable_services(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes for the lookups the app does
CREATE INDEX idx_service_groups_company_id ON public.service_groups(company_id);
CREATE INDEX idx_service_group_items_group_id ON public.service_group_items(group_id);
