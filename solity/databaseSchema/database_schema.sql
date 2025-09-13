-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.clients (
  name text NOT NULL,
  email text,
  phone text,
  address text,
  contact_person text,
  notes text,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_type text DEFAULT 'Particulares'::text CHECK (client_type = ANY (ARRAY['Colegios & Universidades'::text, 'Particulares'::text, 'Tour Operadores'::text, 'Empresas'::text, 'Iglesias'::text, 'Empresas Publicas'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT clients_pkey PRIMARY KEY (id)
);
CREATE TABLE public.companies (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text NOT NULL,
  CONSTRAINT companies_pkey PRIMARY KEY (id)
);
CREATE TABLE public.leads (
  nombre text,
  telefono text,
  email text,
  nombre_empresa text,
  personas_empresa text,
  ventas_anuales text,
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT leads_pkey PRIMARY KEY (id)
);
CREATE TABLE public.payment_transactions (
  payment_id uuid,
  amount numeric,
  payment_method text,
  transaction_date date,
  notes text,
  created_by uuid,
  quotation_id uuid NOT NULL,
  receipt_photo_url text,
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payment_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT payment_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT payment_transactions_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id),
  CONSTRAINT payment_transactions_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id)
);
CREATE TABLE public.payments (
  quotation_id uuid,
  payment_number integer NOT NULL,
  amount numeric NOT NULL,
  due_date date NOT NULL,
  paid_date date,
  notes text,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text DEFAULT 'pendiente'::text CHECK (status = ANY (ARRAY['pendiente'::text, 'pagado'::text, 'vencido'::text])),
  payment_type text DEFAULT 'Pago Regular'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  payment_method text,
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id)
);
CREATE TABLE public.quotations (
  discount_percentage numeric,
  subtotal_amount numeric,
  items jsonb,
  client_name text NOT NULL,
  client_email text,
  user_id uuid,
  observations text,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  total_amount numeric NOT NULL DEFAULT 0,
  people_count integer DEFAULT 1,
  quotation_status text DEFAULT 'solicitada'::text,
  created_at timestamp with time zone DEFAULT now(),
  quotation_number bigint GENERATED ALWAYS AS IDENTITY NOT NULL UNIQUE,
  value_per_person numeric DEFAULT 0,
  fixed_value numeric DEFAULT 0,
  client_id uuid,
  phone text,
  event_type text CHECK (event_type = ANY (ARRAY['Almuerzo o Cena'::text, 'Paseo de Curso'::text, 'Uso salones'::text, 'Estadía y Alimentación'::text, 'Paseo fin de año'::text, 'Celebraciones'::text, 'Matrimonios'::text, 'Graduación'::text])),
  event_date date,
  responsible_user uuid,
  request_type text DEFAULT 'requerimiento'::text CHECK (request_type = ANY (ARRAY['requerimiento'::text, 'cotizacion'::text])),
  updated_at timestamp with time zone DEFAULT now(),
  requires_invoice boolean DEFAULT false,
  has_contract boolean DEFAULT false,
  payment_plan_type text DEFAULT 'default'::text CHECK (payment_plan_type = ANY (ARRAY['contado'::text, 'default'::text, 'three_payments'::text, 'custom'::text])),
  CONSTRAINT quotations_pkey PRIMARY KEY (id),
  CONSTRAINT quotations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT quotations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT quotations_responsible_user_fkey FOREIGN KEY (responsible_user) REFERENCES auth.users(id)
);
CREATE TABLE public.user_profiles (
  company_id bigint NOT NULL,
  user_id uuid UNIQUE,
  email text NOT NULL,
  full_name text,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  role text NOT NULL DEFAULT 'vendedor'::text CHECK (role = ANY (ARRAY['administrador'::text, 'vendedor'::text, 'operaciones'::text, 'recepcion'::text])),
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
