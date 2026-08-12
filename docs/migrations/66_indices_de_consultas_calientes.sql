-- Migración 66 — Índices para las consultas que corren en cada pantalla
-- 12-08-2026
--
-- HONESTIDAD PRIMERO: hoy esto NO se nota. Se midió con EXPLAIN ANALYZE
-- antes de escribirlo y el escaneo secuencial de `quotations` tarda
-- 0,4 ms — la tabla tiene 384 filas y la más grande del sistema tiene
-- 451. La lentitud que reportó Felipe el 12-08 era otra cosa (la
-- distancia al servidor: ~430 ms por ida y vuelta desde Chile), y esa
-- se arregló contando viajes, no indexando.
--
-- Esto es SEGURO A FUTURO, por decisión de Felipe: los seis índices
-- cubren los filtros exactos que hacen las consultas más llamadas del
-- sistema, y cuando estas tablas crezcan un orden de magnitud van a
-- estar puestos desde antes. Un índice de más en una tabla chica cuesta
-- unos kilobytes y un pelo en cada escritura; una tabla grande sin
-- índice cuesta la pantalla entera.
--
-- Cada uno nace de un filtro real, verificado en el código:

-- 1. El TABLERO de cotizaciones — la consulta más llamada del sistema.
--    quotations.repository.ts findAll(): company_id + request_type +
--    quotation_status IN (...).
CREATE INDEX IF NOT EXISTS idx_quotations_company_type_status
  ON public.quotations (company_id, request_type, quotation_status);

-- 2. La FICHA 360° del cliente — clients.repository.ts findSummary():
--    client_id + company_id.
CREATE INDEX IF NOT EXISTS idx_quotations_company_client
  ON public.quotations (company_id, client_id);

-- 3. Las CUOTAS de una cotización — findSummary, Post-Venta y el
--    cálculo de "plata vencida". La tabla payments solo tenía su
--    llave primaria.
CREATE INDEX IF NOT EXISTS idx_payments_quotation
  ON public.payments (quotation_id);

-- 4. Los ABONOS de una cuota — payments.repository.ts, y el cálculo de
--    por-cobrar que los pide de a 200. También solo tenía su llave.
CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment
  ON public.payment_transactions (payment_id);

-- 5. Los RESPALDOS comerciales de una cotización.
CREATE INDEX IF NOT EXISTS idx_event_documents_quotation
  ON public.event_documents (quotation_id);

-- 6. La LISTA de clientes — clients.repository.ts findAll(): company_id.
--    La tabla solo tenía su llave primaria.
CREATE INDEX IF NOT EXISTS idx_clients_company
  ON public.clients (company_id);
