-- REVERSA de la 39: reabre la inserción anónima de leads (el estado
-- que dejó la Fase 0). Solo si la mudanza #1 se revierte.

GRANT INSERT ON leads TO anon;
CREATE POLICY public_insert_leads ON leads
  FOR INSERT TO anon WITH CHECK (true);
