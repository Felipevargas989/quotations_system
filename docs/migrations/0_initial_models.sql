-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.quotations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quotation_number bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid,
  total_amount numeric NOT NULL DEFAULT 0,
  people_count integer DEFAULT 1,
  quotation_status text DEFAULT 'solicitada'::text,
  observations text,
  created_at timestamp with time zone DEFAULT now(),
  client_id uuid,
  event_type text CHECK (event_type = ANY (ARRAY['Almuerzo o Cena'::text, 'Paseo de Curso'::text, 'Uso salones'::text, 'Estadía y Alimentación'::text, 'Paseo fin de año'::text, 'Celebraciones'::text, 'Matrimonios'::text, 'Graduación'::text])),
  event_date timestamp with time zone,
  value_per_person numeric DEFAULT 0,
  fixed_value numeric DEFAULT 0,
  request_type text DEFAULT 'requerimiento'::text CHECK (request_type = ANY (ARRAY['requerimiento'::text, 'cotizacion'::text])),
  updated_at timestamp with time zone DEFAULT now(),
  requires_invoice boolean DEFAULT false,
  has_contract boolean DEFAULT false,
  payment_plan_type text DEFAULT 'default'::text CHECK (payment_plan_type = ANY (ARRAY['contado'::text, 'default'::text, 'three_payments'::text, 'custom'::text])),
  discount_percentage numeric,
  subtotal_amount numeric,
  items jsonb,
  company_id bigint NOT NULL,
  CONSTRAINT quotations_pkey PRIMARY KEY (id),
  CONSTRAINT quotations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT quotations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT quotations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  client_type text DEFAULT 'Particulares'::text CHECK (client_type = ANY (ARRAY['Colegios & Universidades'::text, 'Particulares'::text, 'Tour Operadores'::text, 'Empresas'::text, 'Iglesias'::text, 'Empresas Publicas'::text])),
  address text,
  contact_person text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  company_id bigint NOT NULL,
  CONSTRAINT clients_pkey PRIMARY KEY (id),
  CONSTRAINT clients_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.user_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'vendedor'::text CHECK (role = ANY (ARRAY['administrador'::text, 'vendedor'::text, 'operaciones'::text, 'recepcion'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  company_id bigint NOT NULL,
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quotation_id uuid,
  payment_number integer NOT NULL,
  amount numeric NOT NULL,
  due_date date NOT NULL,
  paid_date date,
  status text DEFAULT 'pendiente'::text CHECK (status = ANY (ARRAY['pendiente'::text, 'pagado'::text, 'vencido'::text])),
  payment_type text DEFAULT 'Pago Regular'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  payment_method text,
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id)
);
CREATE TABLE public.payment_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  payment_id uuid,
  amount numeric,
  payment_method text,
  transaction_date date,
  notes text,
  created_by uuid,
  quotation_id uuid NOT NULL,
  receipt_photo_url text,
  CONSTRAINT payment_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT payment_transactions_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id),
  CONSTRAINT payment_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT payment_transactions_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id)
);
CREATE TABLE public.leads (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  nombre text,
  telefono text,
  email text,
  nombre_empresa text,
  personas_empresa text,
  ventas_anuales text,
  CONSTRAINT leads_pkey PRIMARY KEY (id)
);
CREATE TABLE public.companies (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  name text NOT NULL,
  logo_url text,
  colors jsonb,
  is_premium boolean NOT NULL DEFAULT false,
  notifications jsonb,
  currency text DEFAULT ''::text,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT companies_pkey PRIMARY KEY (id)
);
CREATE TABLE public.variable_services (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  code character varying,
  name character varying NOT NULL,
  price numeric NOT NULL,
  category character varying NOT NULL,
  company_id bigint NOT NULL,
  CONSTRAINT variable_services_pkey PRIMARY KEY (id),
  CONSTRAINT variable_services_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.fixed_services (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  code character varying,
  name character varying NOT NULL,
  price numeric,
  calculation_type character varying NOT NULL DEFAULT 'fijo'::character varying,
  min_price numeric,
  max_price numeric,
  price_per_person numeric,
  company_id bigint NOT NULL,
  CONSTRAINT fixed_services_pkey PRIMARY KEY (id),
  CONSTRAINT fixed_services_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.refunds (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  amount numeric,
  quotation_id uuid NOT NULL,
  is_paid boolean NOT NULL DEFAULT false,
  CONSTRAINT refunds_pkey PRIMARY KEY (id),
  CONSTRAINT refunds_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id)
);
CREATE TABLE public.customer_satisfaction_survey_templates (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  company_id bigint NOT NULL,
  questions jsonb,
  CONSTRAINT customer_satisfaction_survey_templates_pkey PRIMARY KEY (id),
  CONSTRAINT customer_satisfaction_survey_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.customer_satisfaction_survey_responses (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  quotation_id uuid NOT NULL UNIQUE,
  template_id bigint NOT NULL,
  answers jsonb,
  CONSTRAINT customer_satisfaction_survey_responses_pkey PRIMARY KEY (id),
  CONSTRAINT customer_satisfaction_survey_responses_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id),
  CONSTRAINT customer_satisfaction_survey_responses_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.customer_satisfaction_survey_templates(id)
);
