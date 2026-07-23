-- ============================================================
-- Funciones de Analytics — creadas en la base NUEVA (23-07-2026)
-- Origen: base antigua uonjtbyoxawxvhuikbgx (el switchover del 22-07
-- migró datos, no funciones → Analytics quedó caída).
-- MEJORA APLICADA AL COPIAR: "venta" = quotation_status IN
-- ('aceptada','realizada'). Antes solo 'aceptada': cada evento
-- marcado realizado DESAPARECÍA de ingresos/conversión/uso.
-- NUEVAS: get_top_clients_by_quotations y get_recurring_clients
-- (análisis de cartera pedidos por Felipe el 23-07).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_quotation_status_stats(p_company_id integer, p_from_date date, p_to_date date)
 RETURNS TABLE(quotation_status text, total bigint, percentage numeric)
 LANGUAGE sql
AS $function$
  SELECT
    qs.quotation_status,
    qs.total,
    ROUND((qs.total * 100.0 / SUM(qs.total) OVER ()), 2) AS percentage
  FROM (
    SELECT quotation_status, COUNT(*) AS total
    FROM quotations
    WHERE created_at::date BETWEEN p_from_date AND p_to_date
      AND company_id = p_company_id
    GROUP BY quotation_status
  ) qs
  ORDER BY qs.total DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_event_type_conversion_stats(p_company_id integer, p_from_date date, p_to_date date)
 RETURNS TABLE(event_type text, total_quotations bigint, accepted_quotations bigint, conversion_rate_percentage numeric)
 LANGUAGE sql
AS $function$
  SELECT
    event_type,
    COUNT(*) AS total_quotations,
    COUNT(*) FILTER (WHERE quotation_status IN ('aceptada','realizada')) AS accepted_quotations,
    ROUND(
      (COUNT(*) FILTER (WHERE quotation_status IN ('aceptada','realizada')) * 100.0) / NULLIF(COUNT(*), 0),
      2
    ) AS conversion_rate_percentage
  FROM quotations
  WHERE company_id = p_company_id
    AND created_at::date BETWEEN p_from_date AND p_to_date
  GROUP BY event_type
  ORDER BY conversion_rate_percentage DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_event_type_revenue_stats(p_company_id integer, p_from_date date, p_to_date date)
 RETURNS TABLE(event_type text, total_events bigint, total_revenue numeric, revenue_percentage numeric)
 LANGUAGE sql
AS $function$
  SELECT
    event_type,
    COUNT(*) AS total_events,
    SUM(total_amount) AS total_revenue,
    ROUND(
      (SUM(total_amount) * 100.0) / NULLIF(SUM(SUM(total_amount)) OVER (), 0),
      2
    ) AS revenue_percentage
  FROM quotations
  WHERE company_id = p_company_id
    AND created_at::date BETWEEN p_from_date AND p_to_date
    AND quotation_status IN ('aceptada','realizada')
  GROUP BY event_type
  ORDER BY total_revenue DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_revenue_by_client_type(p_company_id integer, p_from_date date, p_to_date date)
 RETURNS TABLE(client_type text, total_quotations bigint, total_revenue numeric, revenue_percentage numeric)
 LANGUAGE sql
AS $function$
  SELECT
    c.client_type,
    COUNT(*) AS total_quotations,
    SUM(q.total_amount) AS total_revenue,
    ROUND(
      SUM(q.total_amount) * 100.0 / NULLIF(SUM(SUM(q.total_amount)) OVER (), 0),
      2
    ) AS revenue_percentage
  FROM quotations q
  JOIN clients c ON q.client_id = c.id
  WHERE q.quotation_status IN ('aceptada','realizada')
    AND q.company_id = p_company_id
    AND q.created_at::date BETWEEN p_from_date AND p_to_date
  GROUP BY c.client_type
  ORDER BY total_revenue DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_top_clients_by_revenue(p_company_id integer, p_from_date date, p_to_date date)
 RETURNS TABLE(client_id uuid, client_name text, client_type text, total_revenue numeric)
 LANGUAGE sql
AS $function$
  SELECT
    c.id AS client_id,
    c.name AS client_name,
    c.client_type,
    SUM(q.total_amount) AS total_revenue
  FROM quotations q
  JOIN clients c ON c.id = q.client_id
  WHERE q.quotation_status IN ('aceptada','realizada')
    AND q.company_id = p_company_id
    AND q.created_at::date BETWEEN p_from_date AND p_to_date
  GROUP BY c.id, c.name, c.client_type
  ORDER BY total_revenue DESC
  LIMIT 10;
$function$;

CREATE OR REPLACE FUNCTION public.get_variable_services_usage(p_company_id integer, p_from_date date, p_to_date date)
 RETURNS TABLE(service_name text, usage_count bigint)
 LANGUAGE sql
AS $function$
  WITH variable_services_expanded AS (
    SELECT jsonb_array_elements(q.items->'variable_services') AS variable_group
    FROM quotations q
    WHERE q.created_at BETWEEN p_from_date AND p_to_date
      AND q.company_id = p_company_id
      AND q.quotation_status IN ('aceptada','realizada')
  ),
  service_items AS (
    SELECT jsonb_array_elements(v.variable_group->'items') AS item
    FROM variable_services_expanded v
  )
  SELECT item->>'nombre' AS service_name, COUNT(*) AS usage_count
  FROM service_items
  GROUP BY service_name
  ORDER BY usage_count DESC LIMIT 10;
$function$;

CREATE OR REPLACE FUNCTION public.get_fixed_services_usage(p_company_id integer, p_from_date date, p_to_date date)
 RETURNS TABLE(service_name text, usage_count bigint)
 LANGUAGE sql
AS $function$
  WITH fixed_services_expanded AS (
    SELECT jsonb_array_elements(q.items->'fixed_services') AS item
    FROM quotations q
    WHERE q.created_at BETWEEN p_from_date AND p_to_date
      AND q.company_id = p_company_id
      AND q.quotation_status IN ('aceptada','realizada')
  )
  SELECT item->>'nombre' AS service_name, COUNT(*) AS usage_count
  FROM fixed_services_expanded
  GROUP BY service_name
  ORDER BY usage_count DESC LIMIT 10;
$function$;

-- ---------- NUEVAS (23-07): análisis de cartera ----------

-- Top clientes por N° de cotizaciones: quién te hace trabajar más.
-- Trae además cuántas se concretaron y la tasa, para cruzar con el top
-- de venta (los que cotizan mucho y compran poco saltan a la vista).
CREATE OR REPLACE FUNCTION public.get_top_clients_by_quotations(p_company_id integer, p_from_date date, p_to_date date)
 RETURNS TABLE(client_id uuid, client_name text, client_type text, total_quotations bigint, won_quotations bigint, conversion_rate numeric)
 LANGUAGE sql
AS $function$
  SELECT
    c.id AS client_id,
    c.name AS client_name,
    c.client_type,
    COUNT(*) AS total_quotations,
    COUNT(*) FILTER (WHERE q.quotation_status IN ('aceptada','realizada')) AS won_quotations,
    ROUND(
      COUNT(*) FILTER (WHERE q.quotation_status IN ('aceptada','realizada')) * 100.0
        / NULLIF(COUNT(*), 0),
      1
    ) AS conversion_rate
  FROM quotations q
  JOIN clients c ON c.id = q.client_id
  WHERE q.company_id = p_company_id
    AND q.created_at::date BETWEEN p_from_date AND p_to_date
  GROUP BY c.id, c.name, c.client_type
  ORDER BY total_quotations DESC
  LIMIT 10;
$function$;

-- Clientes recurrentes: 2 o más eventos concretados en el período.
-- La cartera fiel — la que hay que cuidar.
CREATE OR REPLACE FUNCTION public.get_recurring_clients(p_company_id integer, p_from_date date, p_to_date date)
 RETURNS TABLE(client_id uuid, client_name text, client_type text, won_events bigint, total_revenue numeric)
 LANGUAGE sql
AS $function$
  SELECT
    c.id AS client_id,
    c.name AS client_name,
    c.client_type,
    COUNT(*) AS won_events,
    SUM(q.total_amount) AS total_revenue
  FROM quotations q
  JOIN clients c ON c.id = q.client_id
  WHERE q.company_id = p_company_id
    AND q.quotation_status IN ('aceptada','realizada')
    AND q.created_at::date BETWEEN p_from_date AND p_to_date
  GROUP BY c.id, c.name, c.client_type
  HAVING COUNT(*) >= 2
  ORDER BY won_events DESC, total_revenue DESC
  LIMIT 10;
$function$;
