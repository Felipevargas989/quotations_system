-- Migración 45 — EVENTIA MÓVIL: push (aditiva; aplicada en LAB 29-07).
-- push_devices: a qué teléfonos avisar (suscripciones Web Push por
-- usuario). notifications: registro de avisos YA enviados (dedupe_key
-- evita repetir el mismo aviso). Solo el backend las toca
-- (service_role); cero privilegios para anon/authenticated, como todo.

CREATE TABLE IF NOT EXISTS public.push_devices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  company_id bigint NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_devices_company_idx
  ON public.push_devices (company_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  tipo text NOT NULL,
  titulo text NOT NULL,
  detalle text NOT NULL DEFAULT '',
  destino text NOT NULL DEFAULT '/',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_company_idx
  ON public.notifications (company_id, created_at DESC);

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.push_devices TO service_role;
GRANT ALL ON public.notifications TO service_role;
