-- Migración 46 — PORTAL DEL CLIENTE Fase 1 (aditiva).
-- Cada empresa define su subtítulo de marca (aparece bajo el nombre en
-- los correos) y sus datos de cobro (los leen los correos de cobranza
-- y, en la Fase 2, el portal del cliente).
-- bank_details esperado: { "titular": "", "rut": "", "banco": "",
--   "tipo_cuenta": "", "numero": "", "correo_pagos": "" }

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS bank_details jsonb;
