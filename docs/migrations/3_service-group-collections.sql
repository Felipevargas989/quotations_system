-- Feature: collections ("paquetes") = a group of service_groups.
-- Selecting a collection fills the quotation form with one box per linked group.
-- Run this in the Supabase SQL editor.

-- The collection header (name, scoped per company). No category: it spans many.
CREATE TABLE public.service_group_collections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id),
  name varchar NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_group_collections_company_id_name_unique
    UNIQUE (company_id, name)
);

-- The N service_groups that make up a collection
CREATE TABLE public.service_group_collection_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  collection_id bigint NOT NULL
    REFERENCES public.service_group_collections(id) ON DELETE CASCADE,
  service_group_id bigint NOT NULL
    REFERENCES public.service_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- a group cannot be added twice to the same collection
  CONSTRAINT service_group_collection_items_unique
    UNIQUE (collection_id, service_group_id)
);

-- Helpful indexes for the lookups the app does
CREATE INDEX idx_service_group_collections_company_id
  ON public.service_group_collections(company_id);
CREATE INDEX idx_service_group_collection_items_collection_id
  ON public.service_group_collection_items(collection_id);
