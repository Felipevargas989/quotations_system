-- Reversa de la migración 66 (12-08-2026).
--
-- Borrar un índice no toca ni un dato: solo se pierde el atajo. Las
-- consultas vuelven a escanear la tabla, que es exactamente lo que
-- hacían antes de la 66.
DROP INDEX IF EXISTS public.idx_quotations_company_type_status;
DROP INDEX IF EXISTS public.idx_quotations_company_client;
DROP INDEX IF EXISTS public.idx_payments_quotation;
DROP INDEX IF EXISTS public.idx_payment_transactions_payment;
DROP INDEX IF EXISTS public.idx_event_documents_quotation;
DROP INDEX IF EXISTS public.idx_clients_company;
